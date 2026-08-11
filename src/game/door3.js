/* Door 2 → Door 3 場景交接。
 *
 * This pass activates conserved-fluid routing, dual latch bands, the master
 * lever, and the first-operation pipe rupture. The full monster chase remains
 * deliberately inactive.
 */

import { CFG } from '../logic/config.js';
import { DOOR3_PERFORMANCE } from '../logic/door3-performance.js';
import {
  PUMP_CONSOLE, pumpLatchStates, pumpLevelsFromVolumes, pumpPressureBar,
  pumpPuzzleSolved, pumpVolumeTotal, transferPumpVolume,
} from '../logic/pump-console.js';
import {
  DOOR3_APPROACH, DOOR3_ESCAPE, door3ApproachX, door3ApproachYaw,
  door3ApproachZ, door3EscapeCrossed, door3EscapeProgress, door3EscapeX,
  door3EscapeZ, door3OperatorProgress,
} from '../logic/door3-transition.js';
import { $fade, $panel, $turnCue } from '../dom.js';
import { R, ST, anim, hooks, intro, look } from '../state.js';
import { camera, doorHinge, scene, vestibule } from '../render/scene.js';
import { monster } from '../render/monster.js';
import { decayGroup, lamp } from '../render/decay.js';
import { fill, flash3d, markerLight } from '../render/hintwall.js';
import {
  PUMP_HUB, pumpHub, pumpHubEffectSnapshot, resetPumpHubEffects,
  seekPumpPipeBurst, setPumpHubLevels, setPumpHubPuzzleState,
  triggerPumpPipeBurst, updatePumpHub,
} from '../render/pumphub.js';
import { pulsePumpControl } from '../render/pumpconsole.js';
import {
  resetWetGlass, seekWetGlass, triggerWetGlass, updateWetGlass, wetGlassSnapshot,
} from '../render/wetglass.js';
import { resize, setCameraFov, setRenderPixelRatioCap } from '../render/viewport.js';
import { beep, pipeBurstSound, pumpTransferSound, wetStep } from './audio.js';
import { endRound } from './round.js';
import { T } from './transit.js';

const OPEN_RAD = 1.92;
const START_Z = 0;
const BASE_FOV = camera.fov;
const SPRINT_FOV = BASE_FOV + 3.5;
const APPROACH_FOG = 0.041;
const STEP_SEC = 0.38;
const CONSOLE_STEP_SEC = 0.48;
const ease = x => x * x * (3 - 2 * x);
const DOOR3_CUE = '先按來源缸 －　再按目標缸 ＋　·　拖曳環視';
const DEFAULT_CUE = '按住畫面 = 回頭　·　放開 = 轉回門鎖';
const exploreFov = () => camera.aspect < 0.75 ? 80 : BASE_FOV;

export const D3 = {
  active: false,
  phase: 'idle',
  t: 0,
  travelT: 0,
  stepT: 0,
  previousLightVisibility: null,
  fx: { clock: 0, shake: 0, burstDelay: -1 },
  escape: { progress: 0, crossed: false, complete: false },
  pump: {
    volumes: [...PUMP_CONSOLE.initialVolumes],
    levels: [...PUMP_CONSOLE.initialLevels],
    pressureBar: pumpPressureBar(PUMP_CONSOLE.initialVolumes),
    interactions: 0,
    inputs: 0,
    selectedSource: null,
    lastControl: null,
    lastTransfer: null,
    lastResult: 'idle',
    transferT: 0,
    solveHoldT: 0,
    latchStates: [false, false],
    latchSequenceT: -1,
    latchBeats: [false, false],
    puzzleSolved: false,
    leverUnlocked: false,
    leverPulled: false,
    doorOpenRatio: 0,
    complete: false,
    severeErrors: 0,
    threatAdvances: 0,
    burstTriggered: false,
  },
};

function syncDoor3PumpVisuals() {
  D3.pump.levels = pumpLevelsFromVolumes(D3.pump.volumes);
  D3.pump.pressureBar = pumpPressureBar(D3.pump.volumes);
  setPumpHubLevels(D3.pump.levels, D3.pump.pressureBar);
  setPumpHubPuzzleState({
    latchStates: D3.pump.latchStates,
    selectedSource: D3.pump.selectedSource,
    leverUnlocked: D3.pump.leverUnlocked,
    leverPulled: D3.pump.leverPulled,
    doorOpenRatio: D3.pump.doorOpenRatio,
  });
}

function resetDoor3Pump() {
  D3.pump.volumes = [...PUMP_CONSOLE.initialVolumes];
  D3.pump.levels = pumpLevelsFromVolumes(D3.pump.volumes);
  D3.pump.pressureBar = pumpPressureBar(D3.pump.volumes);
  D3.pump.interactions = 0;
  D3.pump.inputs = 0;
  D3.pump.selectedSource = null;
  D3.pump.lastControl = null;
  D3.pump.lastTransfer = null;
  D3.pump.lastResult = 'idle';
  D3.pump.transferT = 0;
  D3.pump.solveHoldT = 0;
  D3.pump.latchStates = pumpLatchStates(D3.pump.volumes);
  D3.pump.latchSequenceT = -1;
  D3.pump.latchBeats = [false, false];
  D3.pump.puzzleSolved = false;
  D3.pump.leverUnlocked = false;
  D3.pump.leverPulled = false;
  D3.pump.doorOpenRatio = 0;
  D3.pump.complete = false;
  D3.pump.severeErrors = 0;
  D3.pump.threatAdvances = 0;
  D3.pump.burstTriggered = false;
  D3.fx.clock = 0;
  D3.fx.shake = 0;
  D3.fx.burstDelay = -1;
  D3.escape.progress = 0;
  D3.escape.crossed = false;
  D3.escape.complete = false;
  resetWetGlass();
  resetPumpHubEffects();
  syncDoor3PumpVisuals();
}

export function adjustDoor3Pump(index, direction) {
  if (!D3.active || D3.phase !== 'explore') return false;
  const signedDirection = Math.sign(Number(direction));
  if (!Number.isInteger(index) || index < 0 ||
      index >= PUMP_CONSOLE.tankCount || !signedDirection) return false;
  if (D3.pump.transferT > 0 || D3.pump.puzzleSolved) {
    beep('release');
    return true;
  }

  D3.pump.inputs++;
  D3.pump.lastControl = { index, direction: signedDirection };
  pulsePumpControl(index, signedDirection);

  if (signedDirection < 0) {
    if (D3.pump.volumes[index] <= 0) {
      D3.pump.selectedSource = null;
      D3.pump.lastResult = 'empty-source';
      beep('release');
    } else {
      D3.pump.selectedSource = D3.pump.selectedSource === index ? null : index;
      D3.pump.lastResult = D3.pump.selectedSource === null
        ? 'source-cancelled' : 'source-selected';
      beep(D3.pump.selectedSource === null ? 'release' : 'tap');
    }
    syncDoor3PumpVisuals();
    $turnCue.textContent = D3.pump.selectedSource === null
      ? DOOR3_CUE
      : `TANK ${D3.pump.selectedSource + 1} 出口已開　·　選另一缸 ＋`;
    return true;
  }

  if (D3.pump.selectedSource === null) {
    D3.pump.lastResult = 'no-source';
    beep('release');
    return true;
  }

  const source = D3.pump.selectedSource;
  const beforeLatch = pumpLatchStates(D3.pump.volumes);
  const transfer = transferPumpVolume(D3.pump.volumes, source, index);
  D3.pump.selectedSource = null;
  D3.pump.lastResult = transfer.reason;
  D3.pump.lastTransfer = {
    source, target: index, moved: transfer.moved, reason: transfer.reason,
  };
  $turnCue.textContent = DOOR3_CUE;

  if (transfer.moved > 0) {
    D3.pump.volumes = transfer.volumes;
    D3.pump.interactions++;
    D3.pump.transferT = PUMP_CONSOLE.transferSec;
    D3.pump.solveHoldT = 0;
    D3.pump.latchStates = pumpLatchStates(D3.pump.volumes);
    const lostLatch = beforeLatch.some((latched, i) =>
      latched && !D3.pump.latchStates[i]);
    if (lostLatch) {
      D3.pump.severeErrors++;
      D3.pump.threatAdvances++;
      D3.fx.shake = Math.max(D3.fx.shake, 1.25);
      beep('severe');
    } else beep('tap');
    pumpTransferSound();
    if (!D3.pump.burstTriggered) {
      D3.pump.burstTriggered = true;
      D3.fx.burstDelay = 0.30;
    }
    syncDoor3PumpVisuals();
  } else {
    syncDoor3PumpVisuals();
    beep('release');
  }
  return true;
}

export function pullDoor3MasterLever() {
  if (!D3.active || D3.phase !== 'explore') return false;
  if (!D3.pump.leverUnlocked || D3.pump.leverPulled) {
    beep('release');
    return true;
  }
  D3.pump.leverPulled = true;
  D3.phase = 'opening';
  D3.t = 0;
  $turnCue.textContent = '防洪門升起中　·　回頭確認後方';
  beep('release');
  syncDoor3PumpVisuals();
  return true;
}

export function operateDoor3Control(control) {
  if (!control || typeof control !== 'object') return false;
  if (control.kind === 'lever') return pullDoor3MasterLever();
  return adjustDoor3Pump(control.index, control.direction);
}

export function door3PumpSnapshot() {
  const wetGlass = wetGlassSnapshot();
  return {
    capacities: [...PUMP_CONSOLE.capacities],
    volumes: [...D3.pump.volumes],
    levels: [...D3.pump.levels],
    totalVolume: pumpVolumeTotal(D3.pump.volumes),
    pressureBar: D3.pump.pressureBar,
    interactions: D3.pump.interactions,
    inputs: D3.pump.inputs,
    selectedSource: D3.pump.selectedSource,
    lastControl: D3.pump.lastControl ? { ...D3.pump.lastControl } : null,
    lastTransfer: D3.pump.lastTransfer ? { ...D3.pump.lastTransfer } : null,
    lastResult: D3.pump.lastResult,
    transferActive: D3.pump.transferT > 0,
    latchStates: [...D3.pump.latchStates],
    solveHoldT: +D3.pump.solveHoldT.toFixed(2),
    puzzleSolved: D3.pump.puzzleSolved,
    leverUnlocked: D3.pump.leverUnlocked,
    leverPulled: D3.pump.leverPulled,
    complete: D3.pump.complete,
    severeErrors: D3.pump.severeErrors,
    threatAdvances: D3.pump.threatAdvances,
    burstTriggered: D3.pump.burstTriggered,
    escape: {
      progress: +D3.escape.progress.toFixed(2),
      crossed: D3.escape.crossed,
      complete: D3.escape.complete,
      gateZ: DOOR3_ESCAPE.gateZ,
      endZ: DOOR3_ESCAPE.endZ,
      breatheSec: DOOR3_ESCAPE.breatheSec,
    },
    // Kept as a compatibility field for the existing browser scenario.
    waterLensOpacity: wetGlass.amount,
    wetGlass,
    effects: pumpHubEffectSnapshot(),
  };
}

/** Debug-only callers use these through the opt-in lab; normal gameplay never calls them. */
export function resetDoor3DebugEffects() {
  if (!D3.active || D3.phase !== 'explore') return false;
  D3.fx.shake = 0;
  D3.fx.burstDelay = -1;
  D3.pump.burstTriggered = false;
  resetWetGlass();
  resetPumpHubEffects();
  syncDoor3PumpVisuals();
  return true;
}

export function replayDoor3DebugEffects({ wetOnly = false } = {}) {
  if (!D3.active || D3.phase !== 'explore') return false;
  resetDoor3DebugEffects();
  if (!wetOnly) {
    D3.pump.burstTriggered = true;
    triggerPumpPipeBurst();
    pipeBurstSound();
    D3.fx.shake = 1;
  }
  triggerWetGlass();
  return true;
}

export function seekDoor3DebugEffects(time, { wetOnly = false } = {}) {
  if (!D3.active || D3.phase !== 'explore') return false;
  const nextTime = Math.max(0, Math.min(4, Number(time) || 0));
  D3.fx.burstDelay = -1;
  D3.fx.shake = 0;
  D3.pump.burstTriggered = !wetOnly;
  if (wetOnly) resetPumpHubEffects();
  else seekPumpPipeBurst(nextTime);
  seekWetGlass(nextTime);
  syncDoor3PumpVisuals();
  return door3PumpSnapshot();
}

function updateLatchSequence(dt) {
  if (D3.pump.latchSequenceT < 0 || D3.pump.leverUnlocked) return;
  D3.pump.latchSequenceT += dt;
  if (!D3.pump.latchBeats[0] && D3.pump.latchSequenceT >= 0.06) {
    D3.pump.latchBeats[0] = true;
    beep('thunk');
  }
  if (!D3.pump.latchBeats[1] && D3.pump.latchSequenceT >= 0.34) {
    D3.pump.latchBeats[1] = true;
    beep('thunk');
  }
  if (D3.pump.latchSequenceT >= 0.62) {
    D3.pump.leverUnlocked = true;
    $turnCue.textContent = '雙門閂已退回　·　拉下右側總閘桿';
    beep('solved');
    syncDoor3PumpVisuals();
  }
}

function updateDoor3Puzzle(dt) {
  D3.fx.clock += dt;
  D3.fx.shake = Math.max(0, D3.fx.shake - dt * 2.35);
  if (D3.fx.burstDelay >= 0) {
    D3.fx.burstDelay -= dt;
    if (D3.fx.burstDelay <= 0) {
      D3.fx.burstDelay = -1;
      triggerPumpPipeBurst();
      pipeBurstSound();
      triggerWetGlass();
      D3.fx.shake = Math.max(D3.fx.shake, 1);
    }
  }
  updateWetGlass(dt);
  updateLatchSequence(dt);

  if (D3.pump.transferT > 0) {
    D3.pump.transferT = Math.max(0, D3.pump.transferT - dt);
    return;
  }
  if (D3.phase !== 'explore' || D3.pump.puzzleSolved) return;

  if (pumpPuzzleSolved(D3.pump.volumes)) {
    D3.pump.solveHoldT += dt;
    if (D3.pump.solveHoldT >= PUMP_CONSOLE.solveHoldSec) {
      D3.pump.puzzleSolved = true;
      D3.pump.latchSequenceT = 0;
      D3.pump.selectedSource = null;
      syncDoor3PumpVisuals();
    }
  } else D3.pump.solveHoldT = 0;
}

export function door3CameraShake() {
  const amount = D3.active ? D3.fx.shake : 0;
  return {
    x: Math.sin(D3.fx.clock * 57) * 0.026 * amount,
    y: Math.cos(D3.fx.clock * 43) * 0.017 * amount,
    roll: Math.sin(D3.fx.clock * 49) * 0.9 * amount,
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
  } else if (D3.phase === 'through' || D3.phase === 'walk') {
    D3.travelT += dt;
    D3.stepT += dt;
    intro.x = door3ApproachX(D3.travelT);
    intro.z = door3ApproachZ(START_Z, PUMP_HUB.centerWorldZ, D3.travelT);
    look.yaw = door3ApproachYaw(D3.travelT);
    look.target = look.yaw;
    const progress = Math.min(1, D3.travelT / DOOR3_APPROACH.hubSec);
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
      D3.travelT = DOOR3_APPROACH.hubSec;
      D3.stepT = 0;
      intro.x = 0;
      intro.z = PUMP_HUB.centerWorldZ;
      look.yaw = 0;
      look.target = 0;
    }
  } else if (D3.phase === 'cross') {
    intro.x = 0;
    intro.z = PUMP_HUB.centerWorldZ;
    look.yaw = 0;
    look.target = 0;
    intro.bobY *= Math.max(0, 1 - dt * 8);
    intro.roll *= Math.max(0, 1 - dt * 8);
    const hold = ease(Math.min(1, D3.t / DOOR3_APPROACH.crossHoldSec));
    setCameraFov(SPRINT_FOV + (BASE_FOV - SPRINT_FOV) * hold);
    setFlashlightRange(1);
    if (D3.t >= DOOR3_APPROACH.crossHoldSec) {
      D3.phase = 'console';
      D3.t = 0;
      D3.travelT = DOOR3_APPROACH.hubSec + DOOR3_APPROACH.crossHoldSec;
      D3.stepT = CONSOLE_STEP_SEC * 0.35;
    }
  } else if (D3.phase === 'console') {
    D3.travelT = Math.min(DOOR3_APPROACH.runSec, D3.travelT + dt);
    D3.stepT += dt;
    intro.x = door3ApproachX(D3.travelT);
    intro.z = door3ApproachZ(START_Z, PUMP_HUB.centerWorldZ, D3.travelT);
    look.yaw = door3ApproachYaw(D3.travelT);
    look.target = look.yaw;
    const operatorProgress = door3OperatorProgress(D3.travelT);
    bobRun(dt, 0.52);
    while (D3.stepT >= CONSOLE_STEP_SEC) {
      D3.stepT -= CONSOLE_STEP_SEC;
      wetStep(0.72);
    }
    const targetFov = exploreFov();
    setCameraFov(BASE_FOV + (targetFov - BASE_FOV) * operatorProgress);
    setFlashlightRange(1);
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
    setCameraFov(exploreFov());
    if (D3.t >= DOOR3_APPROACH.settleSec) finishPumpWalk();
  } else if (D3.phase === 'explore') {
    setCameraFov(exploreFov());
  } else if (D3.phase === 'opening') {
    setCameraFov(exploreFov());
    D3.pump.doorOpenRatio = Math.min(1, D3.t / 2.70);
    syncDoor3PumpVisuals();
    if (D3.pump.doorOpenRatio >= 1) {
      D3.phase = 'escape';
      D3.t = 0;
      D3.pump.complete = true;
      D3.escape.progress = 0;
      D3.stepT = 0;
      intro.active = true;
      intro.phase = 'run';
      intro.bobY = 0;
      intro.roll = 0;
      intro.bobPhase = 0;
      anim.handsOverride = null;
      look.yaw = 0;
      look.target = 0;
      look.holding = false;
      $turnCue.textContent = '防洪門已開　·　向前衝';
      beep('solved');
    }
  } else if (D3.phase === 'escape') {
    D3.escape.progress = door3EscapeProgress(D3.t);
    D3.escape.crossed ||= door3EscapeCrossed(D3.t);
    intro.x = door3EscapeX(D3.t);
    intro.z = door3EscapeZ(PUMP_HUB.centerWorldZ, D3.t);
    look.yaw = 0;
    look.target = 0;
    bobRun(dt, 0.96);
    D3.stepT += dt;
    while (D3.stepT >= STEP_SEC) {
      D3.stepT -= STEP_SEC;
      wetStep(0.92);
    }
    const sprint = ease(Math.min(1, D3.t / 0.42));
    setCameraFov(exploreFov() + (SPRINT_FOV - exploreFov()) * sprint);
    if (D3.t >= DOOR3_ESCAPE.runSec) {
      D3.phase = 'breathe';
      D3.t = 0;
      D3.escape.progress = 1;
      D3.escape.crossed = true;
      intro.x = 0;
      intro.z = PUMP_HUB.centerWorldZ + DOOR3_ESCAPE.endZ;
      $turnCue.textContent = '';
    }
  } else if (D3.phase === 'breathe') {
    const settle = Math.max(0, 1 - D3.t / 0.65);
    intro.bobY *= settle;
    intro.roll *= settle;
    setCameraFov(BASE_FOV + (SPRINT_FOV - BASE_FOV) * settle);
    if (D3.t >= DOOR3_ESCAPE.breatheSec) {
      D3.phase = 'complete';
      D3.t = 0;
      D3.escape.complete = true;
      intro.active = false;
      intro.bobY = 0;
      intro.roll = 0;
      R.elapsed = R.timer.elapsed;
      endRound('逃脫成功');
    }
  } else if (D3.phase === 'complete') {
    setCameraFov(BASE_FOV);
  }

  updateDoor3Puzzle(dt);
  if (pumpHub.visible) updatePumpHub(dt);
}
