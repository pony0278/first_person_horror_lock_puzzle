/* 輸入：下方撬鎖、上方回頭、鍵盤捷徑。
   設計文件 §4：撬鎖全程不需要放開手指，整組鎖是一個連續動作。 */

import { CFG } from '../logic/config.js';
import { $dev, $hdbg, $pins, view } from '../dom.js';
import { buildPins, renderPins } from '../render/cutaway.js';
import { hd, hdSync } from '../render/hands.js';
import { R, blind, intro, look, pick, ui } from '../state.js';
import { beep } from './audio.js';
import { interrupted } from './halt.js';
import { T, tug, tugAt } from './transit.js';

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
   取件（v3 §4）：按住＝看；伸手把看到的東西拿下來。

   兩根手指分工，因為轉頭與伸手是兩件事：
   第一根手指佔住視角（按住＝回頭，放開＝彈回正面）—— 這是驚慌動作，
   不能有任何判定延遲。轉過去之後那根手指必須留在螢幕上，否則視角就彈回來了，
   所以「看著它」與「碰它」不可能是同一根手指。
   第二根手指＝伸手：落點在鬆脫段附近就算抓到，之後往下拖每 tugPx 再扯一下。
   單手時仍可用第一根手指盲扯（往下拖），保留原本的一手操作路徑。

   桌機主路徑：左鍵按住回頭，**右鍵點一下＝扯一下** —— 左手完全不用動。
   同一顆滑鼠加按右鍵不會產生 pointerdown（規格：和弦按鍵走 pointermove，
   e.button 標示變化的那顆鍵），所以在 pointermove 裡接。
   S 鍵仍可佔住視角（此時滑鼠左鍵＝伸手），當替代路徑保留。 */
let lookId = null;     // 佔住視角的 pointerId
let keyLook = false;   // 桌機用 S 佔住視角
let pullY = null;      // 視角手指的盲扯累積基準
let grabId = null;     // 已經抓在鬆脫段上的 pointerId
let grabY = 0;

/** 視角由「手指」與「S 鍵」共同持有，任何一方還在就維持回頭。 */
function syncLook() {
  const on = lookId !== null || keyLook;
  look.holding = on;
  look.target = on ? 180 : 0;
  if (!on) { grabId = null; pullY = null; }
}

view.addEventListener('contextmenu', e => e.preventDefault());   // 右鍵已被徵用為「伸手」

view.addEventListener('pointerdown', e => {
  if (intro.active || interrupted()) return;
  view.setPointerCapture(e.pointerId);

  if (e.button === 2) { tug(); return; }        // 右鍵單獨按下（S 佔視角時）＝扯，永不搶視角
  if (lookId !== null || keyLook) {             // 已經有人佔著視角 → 這一下是伸手
    if (tugAt(e.clientX, e.clientY)) { grabId = e.pointerId; grabY = e.clientY; }
    return;
  }
  lookId = e.pointerId;
  pullY = e.clientY;
  syncLook();
});

view.addEventListener('pointermove', e => {
  if (T.phase !== 'door2') return;
  if (e.button === 2 && (e.buttons & 2)) {    // 左鍵按住中加按右鍵（和弦）＝扯一下
    tug();
    return;
  }
  if (e.pointerId === grabId) {               // 抓住了就繼續拉，不再重判命中
    const dy = e.clientY - grabY;
    if (dy >= CFG.transit.tugPx) { grabY = e.clientY; tug(true); }
    else if (dy < 0) grabY = e.clientY;
    return;
  }
  if (e.pointerId !== lookId || pullY === null) return;
  const dy = e.clientY - pullY;
  if (dy >= CFG.transit.tugPx) {
    pullY = e.clientY;                        // 下一次扯從這裡重新累積
    tug();
  } else if (dy < 0) {
    pullY = e.clientY;                        // 上移就重設基準，不做負累積
  }
});

/** 強制放開視角（手指與 S 鍵都放）：彈回正面，抓著的手也鬆開 —— 看不到就抓不住。 */
export const stopLook = () => { lookId = null; keyLook = false; syncLook(); };
const onUp = e => {
  if (e.pointerId === grabId) grabId = null;                 // 伸手那根放開 —— 視角不動
  if (e.pointerId === lookId) { lookId = null; syncLook(); } // 視角那根放開（S 還按著就繼續看）
};
view.addEventListener('pointerup', onUp);
view.addEventListener('pointercancel', onUp);

addEventListener('keydown', e => {
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= CFG.lock.pinCount) { e.shiftKey ? doRelease(n - 1) : doPush(n - 1); }
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
  if (e.key === 'u') {                                  // 換皮 A/B，狀態機不受影響
    CFG.ui.style = CFG.ui.style === 'cutaway' ? 'bars' : 'cutaway';
    $pins.style.transform = '';
    buildPins(); renderPins();
  }
});
addEventListener('keyup', e => { if (e.code === 'KeyS') { keyLook = false; syncLook(); } });
// 切走視窗時 keyup 會漏接 —— 回來時 S 不該還「卡在按下」。
addEventListener('blur', () => { if (keyLook) { keyLook = false; syncLook(); } });
