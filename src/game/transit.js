/* 門 1 → 門 2 過場（F1 切片）：開門 → 穿過門洞 → 轉角 → 經過變電室 → 停在門 2 前。
 *
 * 轉角是接縫，不是幾何（v3 §3 的討論）：轉頭時前室端牆填滿視野，
 * 電力驟暗約 0.2 秒 —— 黑的那一瞬間把鏡頭傳回同一條直走廊的起點，
 * 換上門 2 的裝扮（變電室上牆、衰變跳兩級、提示牆收走）。
 * 驟暗不是欺騙：門 2 的主題就是電力（v3 §7），燈不穩是這段走廊的事實。
 *
 * 站位、怪物、回頭機制全部原封不動 —— 門 2 仍是一條直走廊。
 * 真的彎的走廊要重寫整套站位系統，那是 F3 的事。
 *
 * 姿態借用 intro 的欄位（phase='handle' → 伸手、'run' → 奔跑），
 * 但每幀積分全部在這裡做：R.over=true 讓 loop 裡的 intro 機器停著，不會搶。
 */

import * as THREE from 'three';
import { CFG } from '../logic/config.js';
import { $fade, view } from '../dom.js';
import { R, ST, anim, hooks, intro, look } from '../state.js';
import { camera, cylinder, doorHinge, doorLever, doorLeverRose, keyEye, pickTool, plate, wrench } from '../render/scene.js';
import { doorPanel2, resetDoorPanel } from '../render/doorpanel.js';
import { marker, markerLight, paintPlane } from '../render/hintwall.js';
import { decay, decayStages, reflection } from '../render/decay.js';
import { monster } from '../render/monster.js';
import { ELECTRO, LOOSE, LOOSE_GLOW, electroRoom, loosePiece, matLoose } from '../render/fuseroom.js';
import { beep } from './audio.js';
import { newRound } from './round.js';

const C = CFG.transit;
const OPEN_RAD = 1.92;                       // 門片全開角（≈110°，貼向前室左牆）
const ease = x => x * x * (3 - 2 * x);
const ss = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

/** 過場狀態。
    phase: idle → open → through → corner → approach → arrive
           → door2（互動：回頭取件）→ grab（脫落飛行）→ retrieved → done */
export const T = { active: false, phase: 'idle', t: 0, dipT: -1, seep: 0,
                   tug: 0, focusT: 0, reachT: 0, flyT: 0 };

/* transit 拉著鏡頭沿走廊跑的那幾個階段。
   door2 / grab / retrieved 不算 —— 那時鏡頭交還給玩家，門 2 是可以互動的。
   以前 loop 用 T.active 當「運鏡中」的代名詞，門 2 一變成互動階段就失準
   （怪物會永遠隱形）。 */
const CINE = new Set(['open', 'through', 'corner', 'approach', 'arrive', 'done']);
export const cinematic = () => T.active && CINE.has(T.phase);

export function startTransit() {
  T.active = true; T.phase = 'open'; T.t = 0; T.dipT = -1;

  // 姿態：站在門前，一手伸向門
  intro.active = true; intro.phase = 'handle';
  intro.t = 0; intro.z = 0; intro.bobPhase = 0; intro.bobY = 0; intro.roll = 0;
  intro.arriveF = 1; intro.press = 0;
  look.yaw = 0; look.target = 0; look.holding = false;

  wrench.visible = pickTool.visible = false;   // 工具收起
  monster.visible = false;                     // 贏了 —— 這一段不追
  keyEye.visible = false;
  reflection.mesh.visible = false;
  ST.front = null; ST.blink = 0; ST.pendingJump = false; ST.phase = 'off';

  beep('thunk');                               // 鎖舌退開
}
hooks.startTransit = startTransit;

/** newRound 重置時呼叫：把過場動過的東西全部歸位。 */
hooks.resetTransit = () => {
  hooks.resetDoor3?.();
  hooks.resetDoor2?.();                        // 盤面先收走
  T.active = false; T.phase = 'idle'; T.t = 0; T.dipT = -1; T.seep = 0;
  T.tug = 0; T.focusT = 0; T.reachT = 0; T.flyT = 0;
  anim.handsOverride = null;
  matLoose.emissiveIntensity = LOOSE_GLOW;
  loosePiece.visible = true;
  loosePiece.position.copy(LOOSE.home);
  loosePiece.rotation.set(0, 0, LOOSE.homeRotZ);
  swapped = false;
  decay.floor = 0;                             // 衰變下限跨局重置（跨門才累進）
  doorHinge.rotation.y = 0;
  cylinder.visible = plate.visible = true;     // 門面交還門 1 的機械鎖
  doorLever.visible = doorLeverRose.visible = true;
  resetDoorPanel();
  electroRoom.visible = false;
  paintPlane.visible = true; marker.visible = true;
  markerLight.color.set(0xd8b25a);
  markerLight.position.copy(marker.position); markerLight.position.x += 0.12;
  $fade.style.transition = '';
};

/* 電力驟暗：借 #fade 當黑幕。時序獨立於 phase，全黑的那一格做換裝。 */
let swapped = false;
function dip(dt) {
  if (T.dipT < 0) return;
  T.dipT += dt;
  const { dipDown, dipHold, dipUp } = C;
  if (T.dipT < dipDown) {
    $fade.querySelector('div').textContent = '';
    $fade.style.transition = 'opacity 60ms linear';
    $fade.classList.add('on');
  } else if (T.dipT < dipDown + dipHold) {
    if (!swapped) { swapped = true; doSwap(); }
  } else {
    $fade.style.transition = `opacity ${Math.round(C.dipUp * 1000)}ms`;
    $fade.classList.remove('on');
    if (T.dipT > dipDown + dipHold + dipUp + 0.2) T.dipT = -1;
  }
}

/* 場景換裝：只在全黑時執行一次。 */
function doSwap() {
  // 鏡頭傳回走廊起點，面向門 2
  look.yaw = 0;
  intro.phase = 'run';
  intro.z = C.runFrom;
  intro.arriveF = 0;
  T.phase = 'approach'; T.t = 0;

  doorHinge.rotation.y = 0;                    // 門 2 是關著的

  // 門面換裝：門 2 是電磁門 —— 機械鎖組收起，換上 LCD 與破碎的讀卡機。
  // 謎題在講電，門面不能還在講機械（v3 §9 事實層）。
  cylinder.visible = plate.visible = false;
  doorLever.visible = doorLeverRose.visible = false;
  doorPanel2.visible = true;

  // 門 2 廊道的裝扮：提示牆收走（門 2 不讀牆，缺件由盤面脈衝提示），變電室上牆
  paintPlane.visible = false; marker.visible = false;
  electroRoom.visible = true;
  // 火花燈移到導管缺口 —— 亮的是缺的那一段
  markerLight.color.set(0x9fd8ff);
  markerLight.position.set(-CFG.world.corridorW / 2 + 0.35, ELECTRO.gapY, ELECTRO.gapZ);

  // 環境衰變跳到門 2 等級（v3 §10：跨門累進），在黑幕下一次套完，
  // 避免裝飾在眼前突然出現。
  //
  // 衰變等級與站位索引在這裡分家：環境進到等級 2 並且不再回頭（decay.floor），
  // 但怪物的站位從 0 重新開始 —— 你剛剛跑掉了，牠得重新走過來。
  // 以前兩者共用 ST.index，計時器一解凍怪物會從 22m 一次跳到 2.6m（§6 禁止的橡皮筋）。
  decay.floor = C.stationIndex;
  ST.index = 0;
  ST.z = ST.targetZ = CFG.stations.z[0];       // 站位歸最遠
  ST.phase = 'off'; ST.seen = false; ST.emptyGot = 0; ST.stareT = 0;
  while (decay.applied < decay.floor) {
    decayStages[decay.applied]?.();
    decay.applied++;
    T.seep = CFG.seep.level[decay.applied] ?? 0;
    window.__applySeep(T.seep);
  }
}

export function updateTransit(dt) {
  if (!T.active) return;
  T.t += dt;
  dip(dt);

  if (T.phase === 'open') {
    const p = Math.min(1, T.t / C.openSec);
    doorHinge.rotation.y = OPEN_RAD * ease(p);
    intro.arriveF = 1 - p * 0.5;               // 視線抬平、站位偏移收回一半
    if (p >= 1) { T.phase = 'through'; T.t = 0; intro.phase = 'run'; }
  }

  else if (T.phase === 'through') {
    const p = Math.min(1, T.t / C.throughSec);
    intro.z = -C.throughDist * ease(p);
    intro.arriveF = Math.max(0, 0.5 - p);
    intro.bobPhase += dt * CFG.intro.bobFreq * 0.85;
    intro.bobY = Math.sin(intro.bobPhase * 2) * CFG.intro.bobAmp * 0.85;
    intro.roll = Math.sin(intro.bobPhase) * CFG.intro.rollAmp * 0.85;
    if (p >= 1) { T.phase = 'corner'; T.t = 0; }
  }

  else if (T.phase === 'corner') {
    const p = Math.min(1, T.t / C.cornerSec);
    look.yaw = C.cornerYaw * ease(p);          // 轉向左側開口
    intro.bobY *= 0.9; intro.roll *= 0.9;
    if (p >= 0.6 && T.dipT < 0 && !swapped) T.dipT = 0;   // 轉到一半，燈滅
  }

  else if (T.phase === 'approach') {
    const p = Math.min(1, T.t / C.runSec);
    intro.z = C.runFrom * Math.pow(1 - p, 1.55);
    const speedF = 0.35 + (1 - p);
    intro.bobPhase += dt * CFG.intro.bobFreq * speedF;
    intro.bobY = Math.sin(intro.bobPhase * 2) * CFG.intro.bobAmp * speedF;
    intro.roll = Math.sin(intro.bobPhase) * CFG.intro.rollAmp * speedF;
    intro.arriveF = p * p;

    // 經過變電室：頭轉過去（同 intro 的提示牆掃視，目標換成導管缺口）
    const d = intro.z - C.electroZ;
    const g = d >= C.glanceIn ? 0
            : d >= C.glanceOut ? ss(C.glanceIn, C.glanceOut, d)
            : d >= -0.7 ? 1
            : d >= -1.5 ? ss(-1.5, -0.7, d)
            : 0;
    const ahead = Math.max(0.2, d);
    look.yaw = Math.min(C.glanceMaxYaw,
      (Math.atan2(CFG.world.corridorW / 2, ahead) * 180) / Math.PI) * g;

    if (p >= 1) {
      T.phase = 'arrive'; T.t = 0;
      intro.phase = 'handle'; intro.z = 0; intro.arriveF = 1;
      intro.bobY = 0; intro.roll = 0;
      look.yaw = 0;
      beep('tap');
    }
  }

  else if (T.phase === 'arrive') {
    if (T.t >= C.holdSec) {
      // 交還視角控制：intro.active=false 讓上方的「按住＝回頭」重新生效。
      // startDoor2 只讓盤面上桌；保險絲落槽前沿用上一回合的 round 暫停。
      T.phase = 'door2'; T.t = 0;
      intro.active = false;
      hooks.startDoor2?.();                   // 盤面上桌；空槽與身後火花由 door2 同拍提示
    }
  }

  else if (T.phase === 'door2') {
    // 玩家只要按住回頭。鬆脫段進入視野 0.42 秒後，手會自動伸出取下；
    // 不再要求第二根手指、右鍵和弦或精準拖拉。
    const point = grabPoint();
    const focused = Boolean(point) && Math.abs(look.yaw) >= C.grabYawMin;
    matLoose.emissiveIntensity = focused
      ? LOOSE_GLOW + 0.7 * (0.5 + 0.5 * Math.sin(T.t * 5.2))
      : LOOSE_GLOW;

    if (focused) {
      T.focusT += dt;
      markerLight.intensity = Math.max(markerLight.intensity, 1.1 + T.focusT * 2.8);
      if (T.focusT >= 0.10) anim.handsOverride = 'reach';
      if (T.focusT >= C.autoGrabSec) tug(true);
    } else {
      T.focusT = Math.max(0, T.focusT - dt * 2.5);
      if (T.focusT <= 0 && T.reachT <= 0) anim.handsOverride = null;
    }

    if (T.reachT > 0) { T.reachT -= dt; if (T.reachT <= 0 && !focused) anim.handsOverride = null; }
    if (T.t >= C.door2IdleSec) finish('斷電太久 —— 重新開始');   // 線上版防卡死
  }

  else if (T.phase === 'grab') {
    // 脫落：往玩家方向飛（玩家正回著頭，面向 +z），再沉出視野下緣
    T.flyT += dt;
    const p = Math.min(1, T.flyT / C.grabFlySec);
    const e = ease(p);
    loosePiece.position.lerpVectors(grabFrom, grabTo, e);
    loosePiece.position.y -= 0.55 * p * p;               // 末段下沉出視野
    loosePiece.rotation.z = LOOSE.homeRotZ + e * 1.2;
    loosePiece.rotation.y = e * 0.8;
    if (p >= 1) {
      loosePiece.visible = false;
      T.phase = 'retrieved'; T.t = 0;
      anim.handsOverride = null;
      beep('tap');
    }
  }

  else if (T.phase === 'retrieved') {
    if (T.t >= C.retrievedHoldSec) {
      // 零件落進空槽並自動對正；Door 2 的 20 秒回合從這一刻才開始。
      // door2 沒掛（例如未來的純取件關）才走舊的收尾。
      if (hooks.door2Insert?.()) { T.phase = 'door2'; T.t = 0; }
      else finish('保險絲到手 —— 門 2 施工中');
    }
  }
}

/* 結尾共用：切黑一句話，然後自動重開（線上版維持可循環）。
   door2 通電後也從這裡收尾（它經由 export 呼叫，不反向 import）。 */
export function finishTransit(msg) { finish(msg); }
function finish(msg) {
  T.phase = 'done';
  swapped = false;
  anim.handsOverride = null;
  $fade.style.transition = '';
  $fade.querySelector('div').textContent = msg;
  $fade.classList.add('on');
  setTimeout(newRound, C.restartMs);
}

const grabFrom = loosePiece.position.clone();
const grabTo = loosePiece.position.clone();

/* ── 自動取件：鬆脫段在畫面上的位置 ──
   不做 raycast 或點擊命中；投影只用來確認零件真的進入畫面，再累積 0.42 秒注視。 */
const tmpV = new THREE.Vector3();

/** 鬆脫段現在在螢幕上的哪裡（client 座標與命中半徑）；不在畫面上則回 null。 */
export function grabPoint() {
  if (!electroRoom.visible || !loosePiece.visible) return null;
  loosePiece.getWorldPosition(tmpV).project(camera);
  if (tmpV.z > 1) return null;                                  // 在身後
  if (Math.abs(tmpV.x) > 1.05 || Math.abs(tmpV.y) > 1.05) return null;   // 出畫面
  const r = view.getBoundingClientRect();
  return {
    x: r.left + (tmpV.x * 0.5 + 0.5) * r.width,
    y: r.top + (-tmpV.y * 0.5 + 0.5) * r.height,
    r: Math.max(C.grabTapPx, Math.min(r.width, r.height) * 0.16),
  };
}

/** 舊測試／無障礙相容接點；主輸入已不呼叫，玩家只需注視自動取件。 */
export function tugAt(clientX, clientY) {
  if (T.phase !== 'door2') return false;
  const p = grabPoint();
  if (!p) return false;
  if (Math.hypot(clientX - p.x, clientY - p.y) > p.r) return false;
  return tug(true);
}

/** 開始自動取件。aimed=false 只保留給測試／無障礙接點，仍要求已回頭看見零件。 */
export function tug(aimed = false) {
  if (T.phase !== 'door2') return false;
  if (!aimed && Math.abs(look.yaw) < C.grabYawMin) return false;

  T.tug = 1;
  T.focusT = C.autoGrabSec;
  T.reachT = 0.45;
  anim.handsOverride = 'reach';
  markerLight.intensity = 2.6;
  beep('thunk');

  T.phase = 'grab'; T.flyT = 0;
  matLoose.emissiveIntensity = 1.4;
  grabFrom.copy(loosePiece.position);
  // 玩家在 z=0 面向 +z：飛到臉前偏下
  grabTo.set(0.12, 1.05, 0.85);
  beep('release');
  return true;
}
