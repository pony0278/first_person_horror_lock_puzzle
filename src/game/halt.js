/* 中斷：切到背景（報告 H2）與 WebGL context 遺失（報告 H3）。
   看不見畫面的期間一律把隱藏計時器停下來 —— 玩家不該在看不到怪物時被殺掉。 */

import { $halt } from '../dom.js';
import { renderPins } from '../render/cutaway.js';
import { renderer } from '../render/scene.js';
import { R } from '../state.js';
import { unlockAudio } from './audio.js';
import { crazyGamesGameplay } from './crazygames-lifecycle.js';
import { resize } from '../render/viewport.js';

/* ═══════════════════════════════════════════════════════════
   中斷：切到背景（報告 H2）與 WebGL context 遺失（報告 H3）
   ═══════════════════════════════════════════════════════════ */

/* 隱藏計時器走的是牆鐘（必須如此 —— 累加 dt 會讓時限隨幀率浮動，
   怪物就不誠實了）。代價是它在畫面看不見的時候照樣前進：一則通知橫幅
   或誤觸 home 就吃掉 20 秒時限的 15~25%，而玩家不會知道自己是被這個殺死的。
   所以看不見的期間一律把計時器停下來。 */
export const HALT_MSG = {
  hidden: '',                                   // 切到背景不需要文案，玩家本來就沒在看
  contextlost: '畫面中斷了　·　正在等待恢復',
};
export const halted = new Set();

export function setHalt(reason, on) {
  if (on) { halted.add(reason); R.timer.pause(reason); }
  else    { halted.delete(reason); R.timer.resume(reason); }

  // CrazyGames handles tab / focus visibility itself. Only an actual WebGL
  // rendering interruption is one of our own gameplay breaks.
  if (reason === 'contextlost') {
    if (on) crazyGamesGameplay.pause(reason);
    else crazyGamesGameplay.resume(reason);
  }

  // 只有 context 遺失需要蓋畫面 —— 那時 canvas 是全黑的，不講一聲玩家不知道發生什麼事
  const msg = [...halted].map(r => HALT_MSG[r]).filter(Boolean)[0] ?? '';
  $halt.querySelector('p').textContent = msg;
  $halt.classList.toggle('on', !!msg);
}

/** 中斷期間下方停止接受輸入，與回頭時的規則一致（設計文件 §5）。 */
export const interrupted = () => halted.size > 0;

document.addEventListener('visibilitychange', () => {
  setHalt('hidden', document.hidden);
  // CrazyGames explicitly tracks focus/visibility on its own; do not emit
  // gameplayStop/gameplayStart here or the platform would double-count it.
  if (!document.hidden) unlockAudio();
});

/* three.js 的 WebGLRenderer 本來就會處理 context 的遺失與恢復（實測畫面
   與遊戲狀態都回得來），所以這裡不重做恢復流程 —— 只補它管不到的兩件事：
   遺失期間的計時器與畫面提示。 */
renderer.domElement.addEventListener('webglcontextlost', () => {
  setHalt('contextlost', true);
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  setHalt('contextlost', false);
  resize();                                     // 尺寸依附在 context 上，重新套一次
  renderPins();
});
