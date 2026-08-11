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
import * as THREE from 'three';
import './state.js';
import './dom.js';
import './render/materials.js';
import './render/scene.js';
import './render/monster.js';
import './render/decay.js';
import { flash3d, markerLight, paintPlane, paintStatus } from './render/hintwall.js';
import './render/fuseroom.js';
import './render/pumphub.js';
import './render/doorpanel.js';
import './render/hands.js';
import './game/audio.js';
import './render/cutaway.js';
import './render/viewport.js';
import './game/round.js';
import './game/transit.js';
import './game/door2-circuit.js';
import './game/door3.js';
import './game/halt.js';
import './game/input.js';
import './game/loop.js';

import { CFG } from './logic/config.js';
import { DOOR3_PERFORMANCE, drawingBufferPixelBudget } from './logic/door3-performance.js';
import { DOOR3_THREAT_LIMIT_SEC } from './logic/door3-threat.js';
import { $pins } from './dom.js';
import { R, ST, hooks, intro, look } from './state.js';
import { DOOR_Z, camera, renderer, scene, vestibule } from './render/scene.js';
import { renderPins } from './render/cutaway.js';
import { audioPerformanceState, audioState } from './game/audio.js';
import { newRound, skipIntro } from './game/round.js';
import { T, grabPoint } from './game/transit.js';
import { D2, testDoor2 } from './game/door2-circuit.js';
import { D3, door3PumpSnapshot } from './game/door3.js';
import { inferPinOrder, missingPuzzlePins } from './logic/pin-puzzle.js';
import { emptyFuseSlot, isCircuitSolved, solveCircuit, traceCircuit } from './logic/circuit.js';
import { CB, breakerCentreClient, switchCentreClient } from './render/circuitboard.js';
import { doorPanel2, lcdGreen, lcdRed } from './render/doorpanel.js';
import { PUMP_HUB, door3Anchors, pumpHub } from './render/pumphub.js';
import {
  PUMP_CONSOLE_LAYOUT, PUMP_CONSOLE_VISUAL, pumpConsole, pumpControlCentreClient,
  pumpGaugeCentreClient, pumpLeverCentreClient,
} from './render/pumpconsole.js';
import { door3ControlPressSnapshot } from './render/hands.js';
import { decay } from './render/decay.js';
import { monster } from './render/monster.js';
import { renderPixelRatioCap, resize } from './render/viewport.js';
import { tick } from './game/loop.js';
import { initDebug } from './game/debug.js';

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
/* 鬆脫段現在在螢幕上的哪裡 —— 測試用它驗證玩家回頭後確實看得到零件，
   不再拿這個座標模擬第二根手指。 */
window.__grabPoint = grabPoint;
/* 門 1 符號＋點數序列：牆面與門鎖候選共用同一組撞針點數。 */
window.__lockPuzzle = () => {
  const puzzle = R.puzzle; if (!puzzle) return null;
  const wallPoint = paintPlane.getWorldPosition(paintPlane.position.clone()).project(camera);
  const corridorPoint = paintPlane.position.clone().set(0, 1.55, 8).project(camera);
  return {
    ruleId: puzzle.ruleId,
    clues: puzzle.clues.map(clue => ({ ...clue })),
    pinCounts: [...puzzle.pinCounts],
    missingIndex: puzzle.missingIndex,
    step: puzzle.step,
    falsePin: puzzle.falsePin,
    falsePins: [...R.lock.falsePins],
    missingPins: missingPuzzlePins(puzzle),
    inferredOrder: inferPinOrder(puzzle),
    trueOrder: [...R.lock.trueOrder],
    singleSource: puzzle.clues.length === 3 &&
                  puzzle.clues.filter(clue => clue.missing).length === 1 &&
                  puzzle.pinCounts.length === CFG.lock.pinCount,
    wall: {
      ready: paintStatus.ready, ruleId: paintStatus.ruleId, visual: paintStatus.visual,
      pins: [...paintStatus.pins], counts: [...paintStatus.counts],
      pinCounts: [...paintStatus.pinCounts],
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
window.__circuit = () => {
  if (!D2.board) return null;
  const solution = solveCircuit(D2.board);
  const trace = traceCircuit(D2.board);
  const visibleTrace = D2.lastTrace ?? trace;
  const switches = D2.board.switches.map((state, i) => ({ i, state, rot: state }));
  return {
    id: D2.board.id,
    active: D2.active, phase: D2.phase,
    fuseInstalled: D2.board.fuseInstalled, slot: emptyFuseSlot(D2.board),
    solved: isCircuitSolved(D2.board), outcome: trace.outcome, fault: visibleTrace.fault,
    passed: [...visibleTrace.passed], reached: visibleTrace.stages.length,
    power: D2.power, lastOutcome: D2.lastOutcome,
    failures: D2.failCount, shorts: D2.failCount,
    tests: D2.tests, autoTests: D2.autoTests,
    fuseNumber: D2.fuseNumber, burnouts: D2.burnouts,
    awaitingFuse: D2.awaitingFuse, scorchedGate: D2.scorchedGate,
    controls: [0, 1, 2, 3], switches, selectors: switches, diverters: switches,
    initial: [...D2.board.initial],
    fuse: D2.board.fuseInstalled,
    cueT: +CB.cueT.toFixed(2), cueSerial: CB.cueSerial,
    cueLight: +markerLight.intensity.toFixed(2),
    cost: solution ? solution.cost : -1,
  };
};
window.__pipe = window.__circuit;
function circuitNext() {
  const board = D2.board; if (!board) return null;
  const solution = solveCircuit(board); if (!solution) return null;
  return board.switches.findIndex((state, i) => state !== solution.states[i]);
}
window.__circuitNext = circuitNext;
window.__pipeNext = circuitNext;
window.__pipeNextFor = () => circuitNext();
window.__circuitSwitchCentre = i => switchCentreClient(i);
window.__pipeCellCentre = i => switchCentreClient(i);
window.__circuitBreakerCentre = () => breakerCentreClient();
window.__pipeTestCentre = () => breakerCentreClient();
window.__testDoor2 = () => testDoor2();
window.__startDoor2 = () => { T.active = true; T.phase = 'door2'; hooks.startDoor2?.(); return Boolean(D2.board); };
window.__insertDoor2Fuse = () => Boolean(hooks.door2Insert?.());
/* 門 2 門面：LCD 現在顯示哪個符號（紅槓＝鎖定、綠框＝解鎖）。 */
window.__doorPanel = () => ({
  visible: doorPanel2.visible,
  mode: !doorPanel2.visible ? 'off' : lcdGreen.visible ? 'green' : 'red',
});
/* Door 3 scene probes. */
function door3AnchorProbe(anchor) {
  const point = anchor.getWorldPosition(anchor.position.clone()).project(camera);
  return {
    ndcX: +point.x.toFixed(2),
    ndcY: +point.y.toFixed(2),
    depth: +point.z.toFixed(2),
    inView: Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 &&
            point.z >= -1 && point.z <= 1,
  };
}

const door3Raycaster = new THREE.Raycaster();
const door3RayOrigin = new THREE.Vector3();
const door3RayTarget = new THREE.Vector3();
const door3RayDirection = new THREE.Vector3();

function visibleInHierarchy(object) {
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

function hasAncestor(object, ancestor) {
  for (let current = object; current; current = current.parent)
    if (current === ancestor) return true;
  return false;
}

function blockerName(object) {
  for (let current = object; current && current !== scene; current = current.parent)
    if (current.name) return current.name;
  return object.type;
}

/** Geometry-aware centre sightline; projection-only checks cannot catch a wall. */
function door3SightlineProbe() {
  scene.updateMatrixWorld(true);
  camera.getWorldPosition(door3RayOrigin);
  door3Anchors.front.getWorldPosition(door3RayTarget);
  door3RayDirection.subVectors(door3RayTarget, door3RayOrigin);
  const targetDistance = door3RayDirection.length();
  door3Raycaster.set(door3RayOrigin, door3RayDirection.normalize());
  door3Raycaster.near = 0.08;
  door3Raycaster.far = Math.max(0.08, targetDistance - 0.30);
  const blocker = door3Raycaster.intersectObjects(scene.children, true).find(hit => {
    const object = hit.object;
    const materialVisible = Array.isArray(object.material)
      ? object.material.some(material => material.visible)
      : object.material?.visible !== false;
    return object.isMesh && materialVisible && visibleInHierarchy(object) &&
      !hasAncestor(object, camera) && !object.userData.sightlineIgnore;
  });
  return {
    clear: !blocker,
    blocker: blocker ? blockerName(blocker.object) : '',
    blockerDistance: blocker ? +blocker.distance.toFixed(2) : null,
    targetDistance: +targetDistance.toFixed(2),
  };
}

/** The raised flood leaf must reveal a real corridor, not the old backing slab. */
function door3EscapePassageProbe() {
  scene.updateMatrixWorld(true);
  door3RayOrigin.set(0, 1.35, PUMP_HUB.frontDoorZ + 0.65);
  pumpHub.localToWorld(door3RayOrigin);
  door3Anchors.escape.getWorldPosition(door3RayTarget);
  door3RayDirection.subVectors(door3RayTarget, door3RayOrigin);
  const targetDistance = door3RayDirection.length();
  door3Raycaster.set(door3RayOrigin, door3RayDirection.normalize());
  door3Raycaster.near = 0.08;
  door3Raycaster.far = Math.max(0.08, targetDistance - 0.30);
  const blocker = door3Raycaster.intersectObjects(scene.children, true).find(hit => {
    const object = hit.object;
    const materialVisible = Array.isArray(object.material)
      ? object.material.some(material => material.visible)
      : object.material?.visible !== false;
    return object.isMesh && materialVisible && visibleInHierarchy(object) &&
      !hasAncestor(object, camera) && !object.userData.sightlineIgnore;
  });
  return {
    clear: !blocker,
    blocker: blocker ? blockerName(blocker.object) : '',
    blockerDistance: blocker ? +blocker.distance.toFixed(2) : null,
    targetDistance: +targetDistance.toFixed(2),
  };
}

function door3ThreatActorProbe() {
  const local = monster.getWorldPosition(new THREE.Vector3());
  pumpHub.worldToLocal(local);
  return {
    visible: monster.visible,
    localX: +local.x.toFixed(2),
    localZ: +local.z.toFixed(2),
    yawDeg: +(THREE.MathUtils.radToDeg(monster.rotation.y)).toFixed(1),
  };
}

function door3PerformanceProbe() {
  let pointLights = 0;
  let transparentSurfaces = 0;
  let instancedBatches = 0;
  let instances = 0;
  let staticBatches = 0;
  let batchedSourceDrawCalls = 0;
  const transmissionMaterials = new Set();
  scene.traverse(object => {
    if (!visibleInHierarchy(object)) return;
    if (object.isPointLight) pointLights++;
    if (object.isInstancedMesh) {
      instancedBatches++;
      instances += object.count;
    }
    if (object.userData.performanceBatch === 'static') staticBatches++;
    if (object.userData.performanceBatch) {
      batchedSourceDrawCalls += Number(object.userData.sourceDrawCalls) || 0;
    }
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material.transparent) transparentSurfaces++;
      if (Number(material.transmission) > 0) transmissionMaterials.add(material);
    }
  });
  const cssWidth = renderer.domElement.clientWidth;
  const cssHeight = renderer.domElement.clientHeight;
  const bufferWidth = renderer.domElement.width;
  const bufferHeight = renderer.domElement.height;
  const frameTime = hooks.door3FrameTimes?.() ?? {
    samples: 0, averageMs: 0, p95Ms: 0, worstMs: 0,
    slowFrames: 0, slowFrameRatio: 0,
  };
  return {
    pixelRatio: +renderer.getPixelRatio().toFixed(2),
    pixelRatioCap: renderPixelRatioCap(),
    cssSize: [cssWidth, cssHeight],
    bufferSize: [bufferWidth, bufferHeight],
    bufferPixels: bufferWidth * bufferHeight,
    pixelBudget: drawingBufferPixelBudget(cssWidth, cssHeight),
    pointLights,
    transmissionMaterials: transmissionMaterials.size,
    transparentSurfaces,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    batching: {
      instancedBatches,
      instances,
      staticBatches,
      batchedSourceDrawCalls,
    },
    frameTime: {
      samples: frameTime.samples,
      averageMs: +frameTime.averageMs.toFixed(2),
      p95Ms: +frameTime.p95Ms.toFixed(2),
      worstMs: +frameTime.worstMs.toFixed(2),
      slowFrames: frameTime.slowFrames,
      slowFrameRatio: +frameTime.slowFrameRatio.toFixed(3),
    },
    wetStepBufferBuilds: audioPerformanceState().wetStepBufferBuilds,
    budget: DOOR3_PERFORMANCE,
  };
}
hooks.door3Performance = door3PerformanceProbe;

window.__door3 = () => ({
  active: D3.active,
  phase: D3.phase,
  visible: pumpHub.visible,
  yaw: +look.yaw.toFixed(1),
  x: +camera.position.x.toFixed(2),
  z: +camera.position.z.toFixed(2),
  doorZ: +DOOR_Z.toFixed(2),
  rearOpeningZ: +(pumpHub.position.z + PUMP_HUB.rearEndZ).toFixed(2),
  hubCenterZ: +pumpHub.position.z.toFixed(2),
  connectorLength: +PUMP_HUB.connectorLength.toFixed(2),
  runDistance: +PUMP_HUB.runDistance.toFixed(2),
  operator: {
    x: +PUMP_HUB.operatorWorldX.toFixed(2),
    z: +PUMP_HUB.operatorWorldZ.toFixed(2),
    yaw: +PUMP_HUB.operatorYaw.toFixed(1),
  },
  distanceToHub: +Math.hypot(
    camera.position.x, camera.position.z - pumpHub.position.z,
  ).toFixed(2),
  distanceToOperator: +Math.hypot(
    camera.position.x - PUMP_HUB.operatorWorldX,
    camera.position.z - PUMP_HUB.operatorWorldZ,
  ).toFixed(2),
  fov: +camera.fov.toFixed(2),
  walking: intro.active,
  vestibuleVisible: vestibule.visible,
  panelHidden: document.body.classList.contains('door3'),
  fadeOpacity: +getComputedStyle(document.getElementById('fade')).opacity,
  flashlightIntensity: +flash3d.intensity.toFixed(2),
  console: {
    ...door3PumpSnapshot(),
    visible: visibleInHierarchy(pumpConsole),
    layout: { ...PUMP_CONSOLE_LAYOUT },
    visual: { ...PUMP_CONSOLE_VISUAL },
    handPress: door3ControlPressSnapshot(),
    gauge: pumpGaugeCentreClient(),
    lever: pumpLeverCentreClient(),
    controls: [0, 1, 2].flatMap(index => [-1, 1]
      .map(direction => ({
        index, direction, ...pumpControlCentreClient(index, direction),
      }))),
  },
  anchors: Object.fromEntries(Object.entries(door3Anchors)
    .map(([name, anchor]) => [name, door3AnchorProbe(anchor)])),
  sightline: door3SightlineProbe(),
  escapePassage: door3EscapePassageProbe(),
  threatActor: door3ThreatActorProbe(),
  performance: door3PerformanceProbe(),
});
window.__startDoor3 = () => Boolean(hooks.startDoor3?.());
window.__door3ControlCentre = (index, direction) =>
  pumpControlCentreClient(Number(index), Number(direction));
window.__door3LeverCentre = () => pumpLeverCentreClient();
window.__door3Look = yaw => {
  if (!D3.active || intro.active) return false;
  look.yaw = Math.max(-180, Math.min(180, Number(yaw) || 0));
  look.target = look.yaw;
  return true;
};
window.__setDoor3ThreatElapsed = seconds => {
  if (!D3.active || D3.phase !== 'explore') return false;
  R.timer.setElapsed(Math.max(0, Math.min(
    DOOR3_THREAT_LIMIT_SEC + 1,
    Number(seconds) || 0,
  )));
  return true;
};

/* Trigger one front-side scare directly for material lifetime tests. */
window.__fireFront = kind => { ST.front = kind; ST.frontT = 0; };
/* 計時／追逐驗收：加速到站位門檻，長流程測試期間可用具名原因暫停。 */
window.__addThreatTime = seconds => R.timer.addPenalty(seconds);
window.__setThreatPaused = on => on ? R.timer.pause('probe') : R.timer.resume('probe');
window.__setPins = states => { R.lock.pins = states.slice(); renderPins(); };
/* 直接解開門 1 —— 過場（transit）的測試入口。照正確順序推真針，觸發 solved → win。 */
window.__solveDoor1 = () => { R.lock.getHint().order.forEach(i => R.lock.push(i)); };
window.__newRound = () => newRound();
/* 直接跳到開場演出的結束狀態。
   演出是 dt 驅動的，低幀率下會等比拉長（見報告 M1）—— CI 的軟體渲染上
   本來 4.45 秒的演出可能跑掉快一分鐘，測試若用固定或有上限的等待，
   會在演出還沒結束時就開始量測，量到的全是垃圾。 */
window.__skipIntro = () => skipIntro();
window.__pinCentres = () => {
  const w = $pins.clientWidth, h = $pins.clientHeight, n = CFG.lock.pinCount;
  const left = h * 0.16 * 2.1, cell = (w - left) / n;
  return { w, h, xs: Array.from({ length: n }, (_, i) => left + cell * (i + 0.5)) };
};

newRound();
initDebug();
resize();
tick();
