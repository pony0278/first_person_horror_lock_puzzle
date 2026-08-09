/* Door 2 → Door 3 場景交接。
 *
 * 這一輪只開放十字泵房的環視灰盒，不啟動水量謎題或怪物計時器。
 * 先驗證空間與方向語言，再把兩套狀態機接上來。
 */

import { CFG } from '../logic/config.js';
import { $fade, $panel, $turnCue } from '../dom.js';
import { R, ST, anim, hooks, intro, look } from '../state.js';
import {
  corridorSeams, corridorShell, door, doorEnvironment, doorHinge, dust, scene, vestibule,
} from '../render/scene.js';
import { monster } from '../render/monster.js';
import {
  decayGroup, lamp, lampFixture, reflection, seepPatches, waterPlane,
} from '../render/decay.js';
import { marker, markerLight, paintPlane } from '../render/hintwall.js';
import { electroRoom } from '../render/fuseroom.js';
import { doorPanel2 } from '../render/doorpanel.js';
import { pumpHub, updatePumpHub } from '../render/pumphub.js';
import { resize } from '../render/viewport.js';
import { beep } from './audio.js';
import { T } from './transit.js';

const OPEN_RAD = 1.92;
const OPEN_SEC = 0.78;
const THROUGH_SEC = 0.88;
const THROUGH_Z = -2.35;
const BLACKOUT_DOWN_SEC = 0.18;
const BLACKOUT_HOLD_SEC = 0.12;
const WALK_SEC = 3.10;
const SETTLE_SEC = 0.46;
const PUMP_ENTRY_Z = 7.60;
const ease = x => x * x * (3 - 2 * x);
const DOOR3_CUE = '左右拖曳環視　·　W / A / S / D 快速轉向';
const DEFAULT_CUE = '按住畫面 = 回頭　·　放開 = 轉回門鎖';

export const D3 = {
  active: false,
  phase: 'idle',
  t: 0,
};

function hidePreviousWorld() {
  corridorShell.visible = false;
  corridorSeams.visible = false;
  door.visible = false;
  doorEnvironment.visible = false;
  vestibule.visible = false;
  dust.visible = false;

  paintPlane.visible = false;
  marker.visible = false;
  markerLight.visible = false;
  electroRoom.visible = false;
  doorPanel2.visible = false;
  monster.visible = false;

  lamp.visible = false;
  lampFixture.visible = false;
  decayGroup.visible = false;
  decayGroup.userData.farLight.visible = false;
  decayGroup.userData.farTube.visible = false;
  for (const patch of seepPatches) patch.mesh.visible = false;
  waterPlane.visible = false;
  reflection.mesh.visible = false;
}

function restorePreviousWorld() {
  corridorShell.visible = true;
  corridorSeams.visible = true;
  door.visible = true;
  doorEnvironment.visible = true;
  vestibule.visible = true;
  dust.visible = true;

  markerLight.visible = true;
  lamp.visible = true;
  lampFixture.visible = true;
  decayGroup.visible = true;
  decayGroup.userData.farLight.visible = true;
  decayGroup.userData.farTube.visible = true;
}

function bobWalk(dt, strength = 1) {
  intro.bobPhase += dt * 6.0;
  intro.bobY = Math.sin(intro.bobPhase * 2) * 0.025 * strength;
  intro.roll = Math.sin(intro.bobPhase) * 0.72 * strength;
}

// Swap worlds only at full black; enter from the pump hub's rear branch.
function enterPumpWalk() {
  hidePreviousWorld();
  pumpHub.visible = true;

  R.door = 3;
  R.over = true;
  R.won = true;
  R.timer.pause('door3-greybox');

  ST.front = null;
  ST.phase = 'off';
  ST.pendingJump = false;
  monster.visible = false;

  intro.active = true;
  intro.phase = 'run';
  intro.t = 0;
  intro.z = PUMP_ENTRY_Z;
  intro.bobPhase = 0;
  intro.bobY = 0;
  intro.roll = 0;
  intro.arriveF = 0;

  look.yaw = 0;
  look.target = 0;
  look.holding = false;
  anim.handsOverride = null;

  scene.fog.density = 0.052;
  $panel.classList.remove('blind');
  D3.phase = 'blackout-hold';
  D3.t = 0;
  beep('thunk');
}

function finishPumpWalk() {
  intro.active = false;
  intro.phase = 'handle';
  intro.t = 0;
  intro.z = 0;
  intro.bobY = 0;
  intro.roll = 0;
  intro.arriveF = 0;
  anim.handsOverride = 'side';

  look.yaw = 0;
  look.target = 0;
  $turnCue.textContent = DOOR3_CUE;
  D3.phase = 'explore';
  D3.t = 0;
}

hooks.startDoor3 = () => {
  if (D3.active) return false;

  T.active = false;
  T.phase = 'done';
  D3.active = true;
  D3.phase = 'open';
  D3.t = 0;

  // Keep the shared intro state machine from competing for the camera.
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
  intro.z = 0;
  intro.bobPhase = 0;
  intro.bobY = 0;
  intro.roll = 0;
  intro.arriveF = 1;
  intro.press = 0;
  look.yaw = 0;
  look.target = 0;
  look.holding = false;
  anim.handsOverride = 'reach';

  // Expand the solved Door 2 view before opening its physical door.
  document.body.classList.add('door3');
  $turnCue.textContent = '';
  resize();

  $fade.querySelector('div').textContent = '';
  $fade.style.transition = '';
  $fade.classList.remove('on');
  beep('release');
  return true;
};

hooks.resetDoor3 = () => {
  D3.active = false;
  D3.phase = 'idle';
  D3.t = 0;
  pumpHub.visible = false;
  restorePreviousWorld();
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
  $fade.style.transition = '';
  resize();
};

export function updateDoor3(dt) {
  if (!D3.active) return;

  D3.t += dt;
  if (D3.phase === 'open') {
    const p = Math.min(1, D3.t / OPEN_SEC);
    doorHinge.rotation.y = OPEN_RAD * ease(p);
    intro.arriveF = 1 - p;
    if (p >= 1) {
      D3.phase = 'through';
      D3.t = 0;
      intro.phase = 'run';
      anim.handsOverride = null;
      beep('tap');
    }
  } else if (D3.phase === 'through') {
    const p = Math.min(1, D3.t / THROUGH_SEC);
    intro.z = THROUGH_Z * ease(p);
    bobWalk(dt, 0.72 + p * 0.28);
    if (p >= 1) {
      D3.phase = 'blackout';
      D3.t = 0;
      $fade.style.transition = `opacity ${Math.round(BLACKOUT_DOWN_SEC * 1000)}ms linear`;
      $fade.classList.add('on');
    }
  } else if (D3.phase === 'blackout' && D3.t >= BLACKOUT_DOWN_SEC) {
    enterPumpWalk();
  } else if (D3.phase === 'blackout-hold' && D3.t >= BLACKOUT_HOLD_SEC) {
    D3.phase = 'walk';
    D3.t = 0;
    $fade.style.transition = 'opacity 300ms ease-out';
    $fade.classList.remove('on');
  } else if (D3.phase === 'walk') {
    const p = Math.min(1, D3.t / WALK_SEC);
    intro.z = PUMP_ENTRY_Z * Math.pow(1 - p, 1.12);
    bobWalk(dt, 0.70 + (1 - p) * 0.30);
    if (p >= 1) {
      D3.phase = 'settle';
      D3.t = 0;
      intro.z = 0;
    }
  } else if (D3.phase === 'settle') {
    const settle = Math.max(0, 1 - D3.t / SETTLE_SEC);
    intro.bobY *= settle;
    intro.roll *= settle;
    if (D3.t >= SETTLE_SEC) finishPumpWalk();
  }

  if (pumpHub.visible) updatePumpHub(dt);
}
