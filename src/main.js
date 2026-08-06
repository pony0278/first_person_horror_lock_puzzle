/* 進入點：把各模組接起來並啟動。
 *
 * 分層（相依方向由上而下，沒有循環）：
 *
 *   logic/      純邏輯，不碰 DOM 與 Three.js。strict TypeScript，有單元測試。
 *   state.js    跨模組共用的可變狀態（回合、視角、撬針姿態、UI 選取）
 *   dom.js      版面元素參照
 *   render/     場景建構與繪製 —— materials → scene → monster / decay / hintwall
 *                                            → hands / cutaway
 *   game/       audio → round / halt / input → loop
 *
 * 為什麼 render/ 與 game/ 仍是 JavaScript：見 README 的
 * 「為什麼只有 src/logic/ 是 TypeScript」。
 */
/* 匯入順序＝場景物件被加進 scene 的順序。ES module 依匯入出現的順序求值，
   所以這一串刻意維持與拆分前單檔中的段落順序一致 —— 場景圖的結構因此
   逐一節點都與重構前相同（由 tools/devicetest/signature.mjs 比對確認）。 */
import './state.js';
import './dom.js';
import './render/materials.js';
import './render/scene.js';
import './render/monster.js';
import './render/decay.js';
import './render/hintwall.js';
import './render/hands.js';
import './game/audio.js';
import './render/cutaway.js';
import './render/viewport.js';
import './game/round.js';
import './game/halt.js';
import './game/input.js';
import './game/loop.js';

import { CFG } from './logic/config.js';
import { $pins } from './dom.js';
import { R, intro, look } from './state.js';
import { renderer, scene } from './render/scene.js';
import { renderPins } from './render/cutaway.js';
import { audioState } from './game/audio.js';
import { newRound } from './game/round.js';
import { resize } from './render/viewport.js';
import { tick } from './game/loop.js';

/* ═══════════════════════════════════════════════════════════
   測試接點
   —— 與 D（dev overlay）、H（手部調整面板）同性質的除錯出口。
   tools/devicetest/ 的自動化測試靠這些讀狀態，因此它們必須存在於實際建置
   出來的檔案裡，而不是某個特製的測試版本。
   ═══════════════════════════════════════════════════════════ */
window.__probe = () => ({
  pins: R.lock.pins.slice(), progress: R.lock.progress, elapsed: R.elapsed,
  over: R.over, yaw: look.yaw, intro: intro.active,
  actx: audioState(),
  dpr: devicePixelRatio, rendererSize: [renderer.domElement.width, renderer.domElement.height],
});
window.__scene = scene;          // 供 tools/devicetest/signature.mjs 比對場景圖結構
window.__setPins = states => { R.lock.pins = states.slice(); renderPins(); };
window.__pinCentres = () => {
  const w = $pins.clientWidth, h = $pins.clientHeight, n = CFG.lock.pinCount;
  const left = h * 0.16 * 2.1, cell = (w - left) / n;
  return { w, h, xs: Array.from({ length: n }, (_, i) => left + cell * (i + 0.5)) };
};

newRound();
resize();
tick();
