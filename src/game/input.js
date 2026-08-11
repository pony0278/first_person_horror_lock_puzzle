/* 輸入：下方撬鎖、上方回頭、鍵盤捷徑。
   設計文件 §4：撬鎖全程不需要放開手指，整組鎖是一個連續動作。 */

import { CFG } from '../logic/config.js';
import { $dev, $hdbg, $pins, view } from '../dom.js';
import { buildPins, renderPins } from '../render/cutaway.js';
import { pumpControlAtClient } from '../render/pumpconsole.js';
import { beginDoor3ControlPress, hd, hdSync } from '../render/hands.js';
import { R, blind, intro, look, pick, ui } from '../state.js';
import { beep } from './audio.js';
import { operateDoor3Control } from './door3.js';
import { interrupted } from './halt.js';

/* ═══════════════════════════════════════════════════════════
   輸入
   ═══════════════════════════════════════════════════════════ */

/* 下方：撬鎖 */
export let drag = null;
$pins.addEventListener('pointerdown', e => {
  if (R.door !== 1 || R.over || blind() || intro.active || interrupted()) return;
  let idx;
  if (CFG.ui.style === 'cutaway') {
    const rect = $pins.getBoundingClientRect();
    const capL = rect.height * 0.16 * 2.1;
    const w = (rect.width - capL) / CFG.lock.pinCount;
    idx = Math.max(0, Math.min(CFG.lock.pinCount - 1, Math.floor((e.clientX - rect.left - capL) / w)));
  } else {
    const tr = e.target.closest('.track'); if (!tr) return;
    idx = +tr.dataset.i;
  }
  $pins.setPointerCapture(e.pointerId);
  ui.sel = idx;
  drag = { y: e.clientY, acted: false };
  renderPins();
});
$pins.addEventListener('pointermove', e => {
  if (!drag || R.over) return;
  const rect = $pins.getBoundingClientRect();
  const capL = CFG.ui.style === 'cutaway' ? rect.height * 0.16 * 2.1 : 0;
  const w = (rect.width - capL) / CFG.lock.pinCount;
  const idx = Math.max(0, Math.min(CFG.lock.pinCount - 1, Math.floor((e.clientX - rect.left - capL) / w)));
  if (idx !== ui.sel) { ui.sel = idx; drag.acted = false; drag.y = e.clientY; renderPins(); }
  const dy = drag.y - e.clientY;
  pick.lift = drag.acted ? 0 : Math.max(0, Math.min(1, dy / 20));   // 工具頂栓的即時行程
  if (!drag.acted && dy >  20) { doPush(ui.sel);    drag.acted = true; pick.lift = 0; }
  if (!drag.acted && dy < -20) { doRelease(ui.sel); drag.acted = true; pick.lift = 0; }
});
$pins.addEventListener('pointerup', () => {
  if (drag && !drag.acted) doPush(ui.sel);          // 單點 = 頂針
  drag = null; pick.lift = 0;
});
$pins.addEventListener('pointercancel', () => { drag = null; pick.lift = 0; });

document.getElementById('dump').onclick = () => {
  if (R.door !== 1 || R.over || blind() || intro.active || interrupted()) return;
  R.lock.releaseAll(); beep('release'); R.history = []; renderPins();
};

export function doPush(i) {
  if (R.door !== 1 || R.over || blind()) return;
  const r = R.lock.push(i);
  if (r === 'ignored') return;
  R.history.push({ i, r });
  renderPins();
}
export function doRelease(i) {
  if (R.door !== 1 || R.over || blind()) return;
  R.lock.release(i); beep('release');
  R.history.push({ i, r: 'released' });
  renderPins();
}

/* 上方：長按觀察、放開回彈（議題 1 規格）。
   Door 2 的零件只要求玩家「回頭看到」：穩定注視片刻後角色會自動伸手取下，
   不再要求第二指、右鍵或拖拉手勢。 */
let lookId = null;
let keyLook = false;
let door3Drag = null;
let door3ControlId = null;
const clampYaw = yaw => Math.max(-180, Math.min(180, yaw));

/** Door 1/2 保留按住回頭；Door 3 改為可停留在任一岔路的拖曳環視。 */
function syncLook() {
  if (R.door === 3) {
    look.holding = lookId !== null;
    return;
  }
  const on = lookId !== null || keyLook;
  look.holding = on;
  look.target = on ? (R.door === 1 ? CFG.look.hintYaw : 180) : 0;
}

view.addEventListener('pointerdown', e => {
  if (intro.active || interrupted()) return;
  if (e.button !== 0 || lookId !== null || (keyLook && R.door !== 3)) return;

  if (R.door === 3) {
    const control = pumpControlAtClient(e.clientX, e.clientY);
    if (control && operateDoor3Control(control)) {
      beginDoor3ControlPress(control);
      view.setPointerCapture(e.pointerId);
      door3ControlId = e.pointerId;
      e.preventDefault();
      return;
    }
  }

  view.setPointerCapture(e.pointerId);
  lookId = e.pointerId;

  if (R.door === 3) {
    door3Drag = { x: e.clientX, yaw: look.target };
    look.holding = true;
  } else syncLook();
});

view.addEventListener('pointermove', e => {
  if (R.door === 3 && lookId === null && door3ControlId === null)
    view.style.cursor = pumpControlAtClient(e.clientX, e.clientY) ? 'pointer' : 'grab';
  if (e.pointerId !== lookId || R.door !== 3 || !door3Drag) return;
  const dx = e.clientX - door3Drag.x;
  look.target = clampYaw(door3Drag.yaw + dx / Math.max(1, view.clientWidth) * 300);
});

/** 強制放開視角。Door 1/2 回彈正面；Door 3 保留玩家選定方向。 */
export const stopLook = () => {
  lookId = null;
  keyLook = false;
  door3Drag = null;
  door3ControlId = null;
  if (R.door === 3) look.holding = false;
  else syncLook();
};
const onUp = e => {
  if (e.pointerId === door3ControlId) {
    door3ControlId = null;
    return;
  }
  if (e.pointerId !== lookId) return;
  lookId = null;
  door3Drag = null;
  if (R.door === 3) look.holding = false;
  else syncLook();
};
view.addEventListener('pointerup', onUp);
view.addEventListener('pointercancel', onUp);

addEventListener('keydown', e => {
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= CFG.lock.pinCount) { e.shiftKey ? doRelease(n - 1) : doPush(n - 1); }

  if (R.door === 3 && !intro.active) {
    const door3Yaw = {
      KeyW: 0, ArrowUp: 0,
      KeyA: 90, ArrowLeft: 90,
      KeyD: -90, ArrowRight: -90,
      KeyS: look.yaw < 0 ? -180 : 180,
      ArrowDown: look.yaw < 0 ? -180 : 180,
    }[e.code];
    if (door3Yaw !== undefined) {
      e.preventDefault();
      look.target = door3Yaw;
      look.holding = false;
      return;
    }
  }

  // 用 e.code 認實體按鍵：中文輸入法開著時 e.key 是 'Process'、
  // Shift/CapsLock 下是 'S' —— 視角交接不能被輸入法狀態綁架。
  if (e.code === 'KeyS') { keyLook = true; syncLook(); }
  if (e.key === ' ') { e.preventDefault(); document.getElementById('dump').click(); }
  if (e.key === 'd') { ui.devOn = !ui.devOn; $dev.style.display = ui.devOn ? 'block' : 'none'; }
  if (e.key === 'h') {
    hd.on = !hd.on;
    $hdbg.style.display = hd.on ? 'block' : 'none';
    if (hd.on) { intro.active = false; hdSync(); }
  }
  if (e.key === 'u' && R.door === 1) {                   // 換皮 A/B 只屬於門 1
    CFG.ui.style = CFG.ui.style === 'cutaway' ? 'bars' : 'cutaway';
    $pins.style.transform = '';
    buildPins(); renderPins();
  }
});
addEventListener('keyup', e => {
  if (R.door !== 3 && e.code === 'KeyS') { keyLook = false; syncLook(); }
});
// 切走視窗時 keyup 會漏接；回來時不保留任何按住／拖曳狀態。
addEventListener('blur', stopLook);
