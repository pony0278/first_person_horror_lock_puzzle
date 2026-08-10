/* Door 2 → Door 3 場景交接。
 *
 * This pass activates the low pump console and live tank/pressure controls.
 * The final water-balance goal and monster timer remain deliberately inactive.
 */

import { CFG } from '../logic/config.js';
import { DOOR3_PERFORMANCE } from '../logic/door3-performance.js';
import {
  PUMP_CONSOLE, adjustPumpLevel, pumpPressureBar,
} from '../logic/pump-console.js';
import {
  DOOR3_APPROACH, door3ApproachX, door3ApproachYaw, door3ApproachZ,
} from '../logic/door3-transition.js';
import { $fade, $panel, $turnCue } from '../dom.js';
import { R, ST, anim, hooks, intro, look } from '../state.js';
import { camera, doorHinge, scene, vestibule } from '../render/scene.js';
import { monster } from '../render/monster.js';
import { decayGroup, lamp } from '../render/decay.js';
import { fill, flash3d, markerLight } from '../render/hintwall.js';
import {
  PUMP_HUB, pumpHub, setPumpHubLevels, updatePumpHub,
} from '../render/pumphub.js';
import { pulsePumpControl } from '../render/pumpconsole.js';
import { resize, setCameraFov, setRenderPixelRatioCap } from '../render/viewport.js';
import { beep, wetStep } from './audio.js';
import { T } from './transit.js';

const OPEN_RAD = 1.92;
const START_Z = 0;
const BASE_FOV = camera.fov;
const SPRINT_FOV = BASE_FOV + 3.5;
const APPROACH_FOG = 0.041;
const STEP_SEC = 0.38;
const ease = x => x * x * (3 - 2 * x);
const DOOR3_CUE = '工作檯 ± 調液面　·　拖曳環視　·　W / A / S / D';
const DEFAULT_CUE = '按住畫面 = 回頭　·　放開 = 轉回門鎖';
const exploreFov = () => camera.aspect < 0.75 ? 70 : BASE_FOV;

export const D3 = {
  active: false,
  phase: 'idle',
  t: 0,
  travelT: 0,
  stepT: 0,
  previousLightVisibility: null,
  pump: {
    levels: [...PUMP_CONSOLE.initialLevels],
    pressureBar: pumpPressureBar(PUMP_CONSOLE.initialLevels),
    interactions: 0,
    lastControl: null,
  },
};

function resetDoor3Pump() {
  D3.pump.levels = [...PUMP_CONSOLE.initialLevels];
  D3.pump.pressureBar = pumpPressureBar(D3.pump.levels);
  D3.pump.interactions = 0;
  D3.pump.lastControl = null;
  setPumpHubLevels(D3.pump.levels, D3.pump.pressureBar);
}

export function adjustDoor3Pump(index, direction) {
  if (!D3.active || D3.phase !== 'explore') return false;
  const signedDirection = Math.sign(Number(direction));
  if (!Number.isInteger(index) || index < 0 ||
      index >= PUMP_CONSOLE.tankCount || !signedDirection) return false;

  const next = adjustPumpLevel(D3.pump.levels, index, signedDirection);
  const changed = next.some((level, i) => level !== D3.pump.levels[i]);
  D3.pump.lastControl = { index, direction: signedDirection };
  pulsePumpControl(index, signedDirection);
  if (changed) {
    D3.pump.levels = next;
    D3.pump.pressureBar = pumpPressureBar(next);
    D3.pump.interactions++;
    setPumpHubLevels(D3.pump.levels, D3.pump.pressureBar);
    beep('tap');
  } else beep('release');
  return true;
}

export function door3PumpSnapshot() {
  return {
    levels: [...D3.pump.levels],
    pressureBar: D3.pump.pressureBar,
    interactions: D3.pump.interactions,
    lastControl: D3.pump.lastControl ? { ...D3.pump.lastControl } : null,
  };
}

const legacyPointLights = () => [lamp, decayGroup.userData.farLight, markerLight, fill];

function enterDoor3Lighting() {
  const lights = legacyPointLights();
  D3.previousLightVisibility = lights.map(light => light.visible);
  for (const light of lights) light.visible = false;
}

function restoreLegacyLighting() {
  if (!D3.previousLightVisibility) return;
  legacyPointLights().forEach((light, index) => {
    light.visible = D3.previousLightVisibility[index];
  });
  D3.previousLightVisibility = null;
}

function bobRun(dt, strength = 1) {
  intro.bobPhase += dt * 7.1;
  intro.bobY = Math.sin(intro.bobPhase * 2) * 0.047 * strength;
  intro.roll = Math.sin(intro.bobPhase) * 1.02 * strength;
}

function clearSceneCover() {
  $fade.classList.remove('on');
  $fade.style.transition = '';
  $fade.style.opacity = '';
}

function setFlashlightRange(progress = 1) {
  const p = ease(Math.max(0, Math.min(1, progress)));
  const near = CFG.light.near;
  const far = CFG.light.far;
  flash3d.intensity = near.intensity + (far.intensity - near.intensity) * p;
  flash3d.decay = near.decay + (far.decay - near.decay) * p;
  flash3d.angle = near.angle + (far.angle - near.angle) * p;
}

function finishPumpWalk() {
  intro.active = false;
  intro.phase = 'handle';
  intro.t = 0;
  // Door 3 remains in the same world coordinates as Door 2. The loop keeps
  // this base position after intro.active becomes false, so looking back shows
  // the actual corridor the player just crossed.
  intro.x = PUMP_HUB.operatorWorldX;
  intro.z = PUMP_HUB.operatorWorldZ;
  intro.bobY = 0;
  intro.roll = 0;
  intro.arriveF = 0;
  anim.handsOverride = 'side';

  look.yaw = PUMP_HUB.operatorYaw;
  look.target = PUMP_HUB.operatorYaw;
  $turnCue.textContent = DOOR3_CUE;
  D3.phase = 'explore';
  D3.t = 0;
  D3.travelT = DOOR3_APPROACH.runSec;
  D3.stepT = 0;
  setCameraFov(exploreFov());
}

hooks.startDoor3 = () => {
  if (D3.active) return false;

  hooks.resetDoor3FrameTimes?.();
  T.active = false;
  T.phase = 'done';
  D3.active = true;
  D3.phase = 'open';
  D3.t = 0;
  D3.travelT = 0;
  D3.stepT = 0;
  resetDoor3Pump();

  // Keep the shared intro state machine from competing for the camera.
  R.door = 3;
  R.over = true;
  R.won = true;
  R.timer.pause('door3-greybox');
  ST.front = null;
  ST.phase = 'off';
  ST.pendingJump = false;
  monster.visible = false;

  intro.active = true;
  intro.phase = 'handle';
  intro.t = 0;
  intro.x = 0;
  intro.z = START_Z;
  intro.bobPhase = 0;
  intro.bobY = 0;
  intro.roll = 0;
  intro.arriveF = 1;
  intro.press = 0;
  look.yaw = 0;
  look.target = 0;
  look.holding = false;
  anim.handsOverride = 'reach';

  // The hub is already attached to Door 2 in world space. Reveal it by opening
  // the physical door, not by spawning or swapping it after the threshold.
  // The old Door 1 → Door 2 vestibule contains a terminal wall and corner void;
  // hide only that legacy set while preserving the shared Door 2 frame.
  vestibule.visible = false;
  pumpHub.visible = true;
  enterDoor3Lighting();
  scene.fog.density = APPROACH_FOG;
  setFlashlightRange(0);
  setCameraFov(BASE_FOV);

  // Expand the solved Door 2 view before opening its physical door.
  document.body.classList.add('door3');
  setRenderPixelRatioCap(DOOR3_PERFORMANCE.maxPixelRatio);
  $turnCue.textContent = '';
  resize();

  $fade.querySelector('div').textContent = '';
  clearSceneCover();
  beep('release');
  return true;
};

hooks.resetDoor3 = () => {
  hooks.resetDoor3FrameTimes?.();
  D3.active = false;
  D3.phase = 'idle';
  D3.t = 0;
  D3.travelT = 0;
  D3.stepT = 0;
  resetDoor3Pump();
  pumpHub.visible = false;
  vestibule.visible = true;
  restoreLegacyLighting();
  doorHinge.rotation.y = 0;

  R.timer.resume('door3-greybox');
  intro.active = false;
  intro.x = 0;
  intro.z = 0;
  intro.bobY = 0;
  intro.roll = 0;
  anim.handsOverride = null;
  document.body.classList.remove('door3');
  setRenderPixelRatioCap(CFG.render.pixelRatio);
  $turnCue.textContent = DEFAULT_CUE;
  scene.fog.density = CFG.fog.density;
  setCameraFov(BASE_FOV);
  clearSceneCover();
  resize();
};

export function updateDoor3(dt) {
  if (!D3.active) return;

  D3.t += dt;
  if (D3.phase === 'open') {
    const p = Math.min(1, D3.t / DOOR3_APPROACH.openSec);
    doorHinge.rotation.y = OPEN_RAD * ease(p);
    intro.arriveF = 1 - p;
    setFlashlightRange(p);
    if (p >= 1) {
      D3.phase = 'through';
      D3.t = 0;
      D3.travelT = 0;
      intro.phase = 'run';
      intro.z = START_Z;
      intro.arriveF = 0;
      D3.stepT = STEP_SEC * 0.55;
      anim.handsOverride = null;
      $panel.classList.remove('blind');
      beep('tap');
    }
  } else if (D3.phase === 'through' || D3.phase === 'walk' || D3.phase === 'cross') {
    D3.travelT += dt;
    D3.stepT += dt;
    intro.x = door3ApproachX(D3.travelT);
    intro.z = door3ApproachZ(START_Z, PUMP_HUB.centerWorldZ, D3.travelT);
    look.yaw = door3ApproachYaw(D3.travelT);
    look.target = look.yaw;
    const progress = Math.min(1, D3.travelT / DOOR3_APPROACH.runSec);
    bobRun(dt, 0.92 + (1 - progress) * 0.18);
    while (D3.stepT >= STEP_SEC) {
      D3.stepT -= STEP_SEC;
      wetStep(0.86 + (1 - progress) * 0.18);
    }
    const sprintIn = ease(Math.min(1, D3.travelT / 0.42));
    setCameraFov(BASE_FOV + (SPRINT_FOV - BASE_FOV) * sprintIn);
    setFlashlightRange(1);

    if (D3.phase === 'through' && D3.travelT >= DOOR3_APPROACH.throughSec) {
      D3.phase = 'walk';
      D3.t = 0;
    }

    if (D3.phase === 'walk' && D3.travelT >= DOOR3_APPROACH.hubSec) {
      D3.phase = 'cross';
      D3.t = 0;
    }

    if (D3.travelT >= DOOR3_APPROACH.runSec) {
      D3.phase = 'settle';
      D3.t = 0;
      intro.x = PUMP_HUB.operatorWorldX;
      intro.z = PUMP_HUB.operatorWorldZ;
      look.yaw = PUMP_HUB.operatorYaw;
      look.target = PUMP_HUB.operatorYaw;
    }
  } else if (D3.phase === 'settle') {
    const settle = Math.max(0, 1 - D3.t / DOOR3_APPROACH.settleSec);
    intro.bobY *= settle;
    intro.roll *= settle;
    const targetFov = exploreFov();
    setCameraFov(targetFov + (SPRINT_FOV - targetFov) * settle);
    if (D3.t >= DOOR3_APPROACH.settleSec) finishPumpWalk();
  } else if (D3.phase === 'explore') {
    setCameraFov(exploreFov());
  }

  if (pumpHub.visible) updatePumpHub(dt);
}
