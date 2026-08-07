/* 輸入：下方撬鎖、上方回頭、鍵盤捷徑。
   設計文件 §4：撬鎖全程不需要放開手指，整組鎖是一個連續動作。 */

import { CFG } from '../logic/config.js';
import { $dev, $hdbg, $pins, view } from '../dom.js';
import { buildPins, renderPins } from '../render/cutaway.js';
import { hd, hdSync } from '../render/hands.js';
import { R, blind, intro, look, pick, ui } from '../state.js';
import { beep } from './audio.js';
import { interrupted } from './halt.js';
import { T, tug } from './transit.js';

/* ═══════════════════════════════════════════════════════════
   輸入
   ═══════════════════════════════════════════════════════════ */

/* 下方：撬鎖 */
export let drag = null;
$pins.addEventListener('pointerdown', e => {
  if (R.over || blind() || intro.active || interrupted()) return;
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
  if (R.over || blind() || intro.active || interrupted()) return;
  R.lock.releaseAll(); beep('release'); R.history = []; renderPins();
};

export function doPush(i) {
  if (R.over || blind()) return;
  const r = R.lock.push(i);
  if (r === 'ignored') return;
  R.history.push({ i, r });
  renderPins();
}
export function doRelease(i) {
  if (R.over || blind()) return;
  R.lock.release(i); beep('release');
  R.history.push({ i, r: 'released' });
  renderPins();
}

/* 上方：長按觀察、放開回彈（議題 1 規格）。
   取件（v3 §4）：按住＝看；按住＋向下拖曳＝把看到的東西拿下來。
   同一根手指、同一個按住 —— 不區分點按與長按，回頭的反應不能慢半拍。
   每累積下拉 tugPx 算一次「扯」，扯不扯得動由 transit.tug() 判斷
   （要在 door2 階段、而且真的看著鬆脫段）。 */
let pullY = null;
view.addEventListener('pointerdown', e => {
  if (intro.active || interrupted()) return;
  view.setPointerCapture(e.pointerId);
  look.holding = true;
  look.target = 180;
  pullY = e.clientY;
});
view.addEventListener('pointermove', e => {
  if (!look.holding || pullY === null || T.phase !== 'door2') return;
  const dy = e.clientY - pullY;
  if (dy >= CFG.transit.tugPx) {
    pullY = e.clientY;                        // 下一次扯從這裡重新累積
    tug();
  } else if (dy < 0) {
    pullY = e.clientY;                        // 上移就重設基準，不做負累積
  }
});
export const stopLook = () => { look.holding = false; look.target = 0; pullY = null; };
view.addEventListener('pointerup', stopLook);
view.addEventListener('pointercancel', stopLook);

addEventListener('keydown', e => {
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= CFG.lock.pinCount) { e.shiftKey ? doRelease(n - 1) : doPush(n - 1); }
  if (e.key === 's') { look.holding = true; look.target = 180; }
  if (e.key === ' ') { e.preventDefault(); document.getElementById('dump').click(); }
  if (e.key === 'd') { ui.devOn = !ui.devOn; $dev.style.display = ui.devOn ? 'block' : 'none'; }
  if (e.key === 'h') {
    hd.on = !hd.on;
    $hdbg.style.display = hd.on ? 'block' : 'none';
    if (hd.on) { intro.active = false; hdSync(); }
  }
  if (e.key === 'u') {                                  // 換皮 A/B，狀態機不受影響
    CFG.ui.style = CFG.ui.style === 'cutaway' ? 'bars' : 'cutaway';
    $pins.style.transform = '';
    buildPins(); renderPins();
  }
});
addEventListener('keyup', e => { if (e.key === 's') { look.holding = false; look.target = 0; } });
