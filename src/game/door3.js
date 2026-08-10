/* Door 2 → Door 3 場景交接。
 *
 * 這一輪只開放十字泵房的環視灰盒，不啟動水量謎題或怪物計時器。
 * 先驗證空間與方向語言，再把兩套狀態機接上來。
 */

import { CFG } from '../logic/config.js';
import {
  DOOR3_APPROACH, door3ApproachZ,
} from '../logic/door3-transition.js';
import { $fade, $panel, $turnCue } from '../dom.js';
import { R, ST, anim, hooks, intro, look } from '../state.js';
import { doorHinge, scene } from '../render/scene.js';
import { monster } from '../render/monster.js';
import { flash3d } from '../render/hintwall.js';
import { PUMP_HUB, pumpHub, updatePumpHub } from '../render/pumphub.js';
import { resize } from '../render/viewport.js';
import { beep } from './audio.js';
import { T } from './transit.js';

const OPEN_RAD = 1.92;
const START_Z = 0;
const ease = x => x * x * (3 - 2 * x);
const DOOR3_CUE = '左右拖曳環視　·　W / A / S / D 快速轉向';
const DEFAULT_CUE = '按住畫面 = 回頭　·　放開 = 轉回門鎖';

export const D3 = {
  active: false,
  phase: 'idle',
  t: 0,
  travelT: 0,
};

function bobWalk(dt, strength = 1) {
  intro.bobPhase += dt * 6.0;
  intro.bobY = Math.sin(intro.bobPhase * 2) * 0.025 * strength;
  intro.roll = Math.sin(intro.bobPhase) * 0.72 * strength;
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
  intro.z = PUMP_HUB.centerWorldZ;
  intro.bobY = 0;
  intro.roll = 0;
  intro.arriveF = 0;
  anim.handsOverride = 'side';

  look.yaw = 0;
  look.target = 0;
  $turnCue.textContent = DOOR3_CUE;
  D3.phase = 'explore';
  D3.t = 0;
  D3.travelT = DOOR3_APPROACH.runSec;
}

hooks.startDoor3 = () => {
  if (D3.active) return false;

  T.active = false;
  T.phase = 'done';
  D3.active = true;
  D3.phase = 'open';
  D3.t = 0;
  D3.travelT = 0;

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
  pumpHub.visible = true;
  scene.fog.density = 0.052;
  setFlashlightRange(0);

  // Expand the solved Door 2 view before opening its physical door.
  document.body.classList.add('door3');
  $turnCue.textContent = '';
  resize();

  $fade.querySelector('div').textContent = '';
  clearSceneCover();
  beep('release');
  return true;
};

hooks.resetDoor3 = () => {
  D3.active = false;
  D3.phase = 'idle';
  D3.t = 0;
  D3.travelT = 0;
  pumpHub.visible = false;
  doorHinge.rotation.y = 0;

  R.timer.resume('door3-greybox');
  intro.active = false;
  intro.z = 0;
  intro.bobY = 0;
  intro.roll = 0;
  anim.handsOverride = null;
  document.body.classList.remove('door3');
  $turnCue.textContent = DEFAULT_CUE;
  scene.fog.density = CFG.fog.density;
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
      anim.handsOverride = null;
      $panel.classList.remove('blind');
      beep('tap');
    }
  } else if (D3.phase === 'through' || D3.phase === 'walk') {
    D3.travelT += dt;
    intro.z = door3ApproachZ(START_Z, PUMP_HUB.centerWorldZ, D3.travelT);
    const progress = Math.min(1, D3.travelT / DOOR3_APPROACH.runSec);
    bobWalk(dt, 0.72 + (1 - progress) * 0.28);
    setFlashlightRange(1);

    if (D3.phase === 'through' && D3.travelT >= DOOR3_APPROACH.throughSec) {
      D3.phase = 'walk';
      D3.t = 0;
    }

    if (D3.travelT >= DOOR3_APPROACH.runSec) {
      D3.phase = 'settle';
      D3.t = 0;
      intro.z = PUMP_HUB.centerWorldZ;
    }
  } else if (D3.phase === 'settle') {
    const settle = Math.max(0, 1 - D3.t / DOOR3_APPROACH.settleSec);
    intro.bobY *= settle;
    intro.roll *= settle;
    if (D3.t >= DOOR3_APPROACH.settleSec) finishPumpWalk();
  }

  if (pumpHub.visible) updatePumpHub(dt);
}
