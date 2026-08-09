/* Door 2 → Door 3 場景交接。
 *
 * 這一輪只開放十字泵房的環視灰盒，不啟動水量謎題或怪物計時器。
 * 先驗證空間與方向語言，再把兩套狀態機接上來。
 */

import { CFG } from '../logic/config.js';
import { $fade, $panel, $turnCue } from '../dom.js';
import { R, ST, anim, hooks, intro, look } from '../state.js';
import {
  corridorSeams, corridorShell, door, doorEnvironment, dust, scene, vestibule,
} from '../render/scene.js';
import { monster } from '../render/monster.js';
import {
  decayGroup, lamp, lampFixture, reflection, seepPatches, waterPlane,
} from '../render/decay.js';
import { marker, markerLight, paintPlane } from '../render/hintwall.js';
import { electroRoom } from '../render/electroroom.js';
import { doorPanel2 } from '../render/doorpanel.js';
import { pumpHub, updatePumpHub } from '../render/pumphub.js';
import { resize } from '../render/viewport.js';
import { beep } from './audio.js';
import { T } from './transit.js';

const FADE_DOWN_SEC = 0.22;
const REVEAL_SEC = 0.48;
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

function enterPumpHub() {
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

  intro.active = false;
  intro.phase = 'handle';
  intro.t = 0;
  intro.z = 0;
  intro.bobY = 0;
  intro.roll = 0;
  intro.arriveF = 0;

  look.yaw = 0;
  look.target = 0;
  look.holding = false;
  anim.handsOverride = 'side';

  scene.fog.density = 0.052;
  document.body.classList.add('door3');
  $panel.classList.remove('blind');
  $turnCue.textContent = DOOR3_CUE;
  resize();

  D3.phase = 'reveal';
  D3.t = 0;
  $fade.style.transition = 'opacity 260ms ease-out';
  $fade.classList.remove('on');
  beep('thunk');
}

hooks.startDoor3 = () => {
  if (D3.active) return false;

  T.active = false;
  T.phase = 'done';
  D3.active = true;
  D3.phase = 'fade';
  D3.t = 0;

  $fade.querySelector('div').textContent = '';
  $fade.style.transition = 'opacity 160ms linear';
  $fade.classList.add('on');
  beep('release');
  return true;
};

hooks.resetDoor3 = () => {
  D3.active = false;
  D3.phase = 'idle';
  D3.t = 0;
  pumpHub.visible = false;
  restorePreviousWorld();

  R.timer.resume('door3-greybox');
  anim.handsOverride = null;
  document.body.classList.remove('door3');
  $turnCue.textContent = DEFAULT_CUE;
  scene.fog.density = CFG.fog.density;
  resize();
};

export function updateDoor3(dt) {
  if (!D3.active) return;

  D3.t += dt;
  if (D3.phase === 'fade' && D3.t >= FADE_DOWN_SEC) {
    enterPumpHub();
  } else if (D3.phase === 'reveal' && D3.t >= REVEAL_SEC) {
    D3.phase = 'explore';
    D3.t = 0;
  }

  updatePumpHub(dt);
}
