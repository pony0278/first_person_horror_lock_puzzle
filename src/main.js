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
import './render/electroroom.js';
import './render/hands.js';
import './game/audio.js';
import './render/cutaway.js';
import './render/viewport.js';
import './game/round.js';
import './game/transit.js';
import './game/halt.js';
import './game/input.js';
import './game/loop.js';

import { CFG } from './logic/config.js';
import { $pins } from './dom.js';
import { R, anim, intro, look } from './state.js';
import { door, doorLever, pickTool, renderer, scene, wrench } from './render/scene.js';
import { renderPins } from './render/cutaway.js';
import { audioState } from './game/audio.js';
import { newRound } from './game/round.js';
import { T } from './game/transit.js';
import { resize } from './render/viewport.js';
import { tick } from './game/loop.js';

/* ═══════════════════════════════════════════════════════════
   測試接點
   —— 與 D（dev overlay）、H（手部調整面板）同性質的除錯出口。
   tools/devicetest/ 的自動化測試靠這些讀狀態，因此它們必須存在於實際建置
   出來的檔案裡，而不是某個特製的測試版本。
   ═══════════════════════════════════════════════════════════ */
window.__probe = () => ({
  // 直接讀計時器而不是 R.elapsed —— 後者每幀才更新一次，
  // 在低幀率下（CI 的軟體渲染、多瀏覽器併行）會落後將近半秒，
  // 量「暫停期間有沒有漏秒」時那個落差會被誤判成漏秒。
  pins: R.lock.pins.slice(), progress: R.lock.progress, elapsed: R.timer.elapsed,
  over: R.over, yaw: look.yaw, intro: intro.active,
  transit: T.phase, tz: +intro.z.toFixed(2), seep: T.seep, tug: T.tug,
  actx: audioState(),
  dpr: devicePixelRatio, rendererSize: [renderer.domElement.width, renderer.domElement.height],
});
window.__scene = scene;          // 供 tools/devicetest/signature.mjs 比對場景圖結構
window.__setPins = states => { R.lock.pins = states.slice(); renderPins(); };
/* 直接解開門 1 —— 過場（transit）的測試入口。照正確順序推真針，觸發 solved → win。 */
window.__solveDoor1 = () => { R.lock.getHint().order.forEach(i => R.lock.push(i)); };
/* 直接跳到開場演出的結束狀態。
   演出是 dt 驅動的，低幀率下會等比拉長（見報告 M1）—— CI 的軟體渲染上
   本來 4.45 秒的演出可能跑掉快一分鐘，測試若用固定或有上限的等待，
   會在演出還沒結束時就開始量測，量到的全是垃圾。 */
window.__skipIntro = () => {
  intro.active = false;
  intro.phase = 'tool';
  intro.t = 0; intro.z = 0; intro.bobY = 0; intro.roll = 0; intro.press = 0;
  intro.arriveF = 1;
  intro.beeped = intro.th1 = intro.th2 = intro.thTool = true;
  look.yaw = 0; look.target = 0;
  anim.timeScale = 1;
  doorLever.rotation.z = 0; door.position.x = 0;
  wrench.visible = pickTool.visible = true;
  wrench.position.z = pickTool.position.z = 0;
  R.timer.start();
};
window.__pinCentres = () => {
  const w = $pins.clientWidth, h = $pins.clientHeight, n = CFG.lock.pinCount;
  const left = h * 0.16 * 2.1, cell = (w - left) / n;
  return { w, h, xs: Array.from({ length: n }, (_, i) => left + cell * (i + 0.5)) };
};

newRound();
resize();
tick();
