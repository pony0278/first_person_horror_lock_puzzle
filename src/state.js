/* 跨模組共用的可變狀態。

   放在同一個模組是為了打破循環相依：撬鎖面板要讀撬針姿態、輸入要改選中的栓、
   主迴圈要改時間倍率，這些若各自留在自己的模組裡就會互相 import。
   ES module 的 import 是唯讀綁定，所以會被重新賦值的值一律包成物件的屬性。 */

import { CFG } from './logic/config.js';
import { HiddenTimer } from './logic/round.js';

export const ST = { index: 0, z: 0, targetZ: 0, moveT: 0, pendingJump: false,
             thresholds: [], stareT: 0, blink: 0, seen: false,
             // 潛伏狀態機：'off' → 'lurk'（累積空無）→ 'face'（貼臉）
             phase: 'off', emptyNeed: 0, emptyGot: 0, glanceT: 0,
             counted: false, faceT: 0, faceMode: 0, readyOff: false, armedT: 0,
             front: null, frontT: 0, frontLeft: 0, frontCool: 0, frontPool: [] };

/* ── 油漆提示牆：提示畫在玩家身後偏左的牆上 ───────────
   斑駁噴漆風格，每局依新答案重畫。回頭讀提示的同時
   必然看到怪物 —— 資訊與威脅耦合在同一個視角裡。 */

export const intro = { active: false, phase: 'run', t: 0, z: 0, bobPhase: 0,
                bobY: 0, roll: 0, arriveF: 1, beeped: false, th1: false, th2: false };

/* ── 光 ─────────────────────────────────────────────── */

export const R = {
  /* door：現在在第幾扇門（1 撬鎖 / 2 管線）。
     limit：這一扇門的隱藏時限 —— 站位門檻、超時判定、極限成功都讀它，
     不再直接讀 CFG.round.limit（三扇門各有各的長度，v3 §3）。 */
  door: 1, limit: CFG.round.limit,
  lock: null, timer: new HiddenTimer(), elapsed: 0, over: false, won: false,
  lookTime: 0, jamTime: 0, jamStart: 0, errorCount: 0, severeCount: 0,
  history: [], attempts: [],
};

export const look = { yaw: 0, target: 0, holding: false };

export const ui = { sel: 0, devOn: false };

export const anim = { handShake: 0, timeScale: 1,
  /* 過場對手部姿態的覆寫（'reach' 等 JPOSE 名；null = 交回一般規則）。
     hands 屬 render 層不能 import game/transit，所以經由這裡傳。 */
  handsOverride: null };

/* 撬針的即時姿態：橫移跟選針、上推時尖端頂起栓（供上下同步與動畫用） */
export const pick = { x: 0, lift: 0 };

/* 視角轉超過門檻時，下方停止接受輸入（設計文件 §5）。
   放在這裡而不是輸入模組 —— 它讀的是視角狀態，輸入層只是消費者。 */
export const blind = () => Math.abs(look.yaw) > CFG.look.blindAt;

/* 跨層回呼。round 在勝利時要啟動過場，但 transit 已 import round（拿 newRound），
   round 再 import transit 就成循環 —— round 改呼叫這裡的掛鉤，transit 載入時填入。 */
export const hooks = {};
