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
import { markerLight, paintPlane, paintStatus } from './render/hintwall.js';
import './render/electroroom.js';
import './render/doorpanel.js';
import './render/hands.js';
import './game/audio.js';
import './render/cutaway.js';
import './render/viewport.js';
import './game/round.js';
import './game/transit.js';
import './game/door2.js';
import './game/halt.js';
import './game/input.js';
import './game/loop.js';

import { CFG } from './logic/config.js';
import { $pins } from './dom.js';
import { R, ST, anim, intro, look } from './state.js';
import { camera, door, doorLever, pickTool, renderer, scene, wrench } from './render/scene.js';
import { renderPins } from './render/cutaway.js';
import { audioState } from './game/audio.js';
import { newRound } from './game/round.js';
import { T, grabPoint } from './game/transit.js';
import { D2 } from './game/door2.js';
import { inferPinOrder, missingPuzzlePins } from './logic/pin-puzzle.js';
import { chain, emptySlot, isSolved, solve } from './logic/pipe.js';
import { PB, cellCentreClient } from './render/pipeboard.js';
import { doorPanel2, lcdGreen, lcdRed } from './render/doorpanel.js';
import { decay } from './render/decay.js';
import { monster } from './render/monster.js';
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
  over: R.over, won: R.won, paused: R.timer.paused, pauseReasons: R.timer.pauseReasons,
  yaw: look.yaw, intro: intro.active,
  transit: T.phase, tz: +intro.z.toFixed(2), seep: T.seep, tug: T.tug,
  door: R.door, limit: R.limit, station: ST.index, decayFloor: decay.floor,
  monster: monster.visible, front: ST.front, frontT: +ST.frontT.toFixed(2),
  actx: audioState(),
  dpr: devicePixelRatio, rendererSize: [renderer.domElement.width, renderer.domElement.height],
});
window.__scene = scene;          // 供 tools/devicetest/signature.mjs 比對場景圖結構
/* 鬆脫段現在在螢幕上的哪裡 —— 測試用它決定「第二根手指」要點哪。
   寫死座標會在鏡頭或走廊寬度一改就變成假通過。 */
window.__grabPoint = grabPoint;
/* 門 1 缺格圖形序列：牆面兩端與門鎖候選使用完全相同的圖形語言。 */
window.__lockPuzzle = () => {
  const puzzle = R.puzzle; if (!puzzle) return null;
  const wallPoint = paintPlane.getWorldPosition(paintPlane.position.clone()).project(camera);
  const corridorPoint = paintPlane.position.clone().set(0, 1.55, 8).project(camera);
  return {
    ruleId: puzzle.ruleId,
    clues: puzzle.clues.map(clue => ({ ...clue })),
    pinShapes: [...puzzle.pinShapes],
    missingIndex: puzzle.missingIndex,
    step: puzzle.step,
    falsePin: puzzle.falsePin,
    falsePins: [...R.lock.falsePins],
    missingPins: missingPuzzlePins(puzzle),
    inferredOrder: inferPinOrder(puzzle),
    trueOrder: [...R.lock.trueOrder],
    singleSource: puzzle.clues.length === 3 &&
                  puzzle.clues.filter(clue => clue.missing).length === 1 &&
                  puzzle.pinShapes.length === CFG.lock.pinCount,
    wall: {
      ready: paintStatus.ready, ruleId: paintStatus.ruleId, visual: paintStatus.visual,
      slots: [...paintStatus.slots], pinShapes: [...paintStatus.pinShapes],
      missingIndex: paintStatus.missingIndex, missingPins: [...paintStatus.missingPins],
      step: paintStatus.step, coverage: paintStatus.coverage,
      svgBytes: paintStatus.svgBytes, error: paintStatus.error, visible: paintPlane.visible,
      ndcX: +wallPoint.x.toFixed(2), ndcY: +wallPoint.y.toFixed(2),
      inView: paintPlane.visible && Math.abs(wallPoint.x) <= 1 && Math.abs(wallPoint.y) <= 1 &&
              wallPoint.z >= -1 && wallPoint.z <= 1,
      corridorNdcX: +corridorPoint.x.toFixed(2), corridorNdcY: +corridorPoint.y.toFixed(2),
      corridorInView: Math.abs(corridorPoint.x) <= 1 && Math.abs(corridorPoint.y) <= 1 &&
                      corridorPoint.z >= -1 && corridorPoint.z <= 1,
    },
  };
};
/* 門 2 盤面的測試接點：狀態、下一個該點的格子、格子的螢幕座標。
   跟 __grabPoint 同一個理由 —— 盤面佈局是抽的，座標寫死必成假通過。 */
window.__pipe = () => {
  if (!D2.board) return null;
  const s = solve(D2.board);
  return { active: D2.active, chain: chain(D2.board).length,
           solved: isSolved(D2.board), slot: emptySlot(D2.board),
           cueT: +PB.cueT.toFixed(2), cueSerial: PB.cueSerial,
           cueLight: +markerLight.intensity.toFixed(2),
           cost: s ? s.cost : -1 };
};
window.__pipeNext = () => {
  const b = D2.board; if (!b) return null;
  const s = solve(b); if (!s) return null;
  for (let k = 0; k < s.path.length; k++) {
    const i = s.path[k];
    if (b.cells[i].rot !== s.rots[k]) return i;
  }
  return null;
};
window.__pipeCellCentre = i => cellCentreClient(i);
/* 門 2 門面：LCD 現在顯示哪個符號（紅槓＝鎖定、綠框＝解鎖）。 */
window.__doorPanel = () => ({
  visible: doorPanel2.visible,
  mode: !doorPanel2.visible ? 'off' : lcdGreen.visible ? 'green' : 'red',
});
/* 直接觸發一次正面事件：正常路徑要進入潛伏期才觸發，這個接點可個別驗素材生命期，
   避免 badge / glitch 像收走的 eye / lever 一樣默默變成啞彈。 */
window.__fireFront = kind => { ST.front = kind; ST.frontT = 0; };
/* 計時／追逐驗收：加速到站位門檻，長流程測試期間可用具名原因暫停。 */
window.__addThreatTime = seconds => R.timer.addPenalty(seconds);
window.__setThreatPaused = on => on ? R.timer.pause('probe') : R.timer.resume('probe');
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
