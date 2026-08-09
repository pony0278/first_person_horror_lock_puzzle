/* 門 2：兩階段電路流程。
   取件完成後才啟動 20 秒追逐；先由指定端口替電容充電，再切換兩個選擇器，
   讓電流經保險絲抵達門閂。亂送到門鎖、短路或繞過安全元件都會跳電，
   但不直接判死，也不額外偷加秒。 */

import { canRotate, emptySlot, insertPiece, phaseReach, rotate, tracePhase } from '../logic/pipe.js';
import { newBoard, pickSpec } from '../logic/pipe.js';
import { $panel, $trip } from '../dom.js';
import {
  PB, cellAt, cueMissingPiece, drawPipe, missingCueLevel, pieceLand, pipeCanvas,
  showPipe, spinCell, testAt,
} from '../render/pipeboard.js';
import { setDoorPanel } from '../render/doorpanel.js';
import { markerLight } from '../render/hintwall.js';
import { CFG } from '../logic/config.js';
import { R, blind, hooks } from '../state.js';
import { beep, zap } from './audio.js';
import { interrupted } from './halt.js';
import { beginDoorRound, completeDoor } from './round.js';
import { T } from './transit.js';

const OPEN_HOLD_SEC = 0.42;
const TRIP_HOLD_SEC = 1.20;
const RELAY_HOLD_SEC = 0.62;
const TEST_CELL_SEC = 0.055;

export const D2 = {
  active: false, board: null, doneT: -1, cueSeen: 0,
  phase: 'charge', charged: false,
  power: 'off', testT: 0, testEnd: 0, lastOutcome: null,
  shortCount: 0, openCount: 0, chargeCount: 0, dischargeCount: 0,
  resetPhaseAfterTrip: false,
};

hooks.door2HasPiece = () => Boolean(D2.board && emptySlot(D2.board) === null);

function clearTrip() {
  $trip.classList.remove('on');
}

hooks.startDoor2 = () => {
  D2.board = newBoard(pickSpec());
  D2.active = true; D2.doneT = -1;
  D2.phase = 'charge'; D2.charged = false;
  D2.power = 'off'; D2.testT = 0; D2.testEnd = 0; D2.lastOutcome = null;
  D2.shortCount = 0; D2.openCount = 0; D2.chargeCount = 0; D2.dischargeCount = 0;
  D2.resetPhaseAfterTrip = false;
  clearTrip();

  // 門 1 勝利留下的 round 暫停保持到零件自動落槽；取件不是計時中的隱藏教學。
  R.door = 2; R.limit = CFG.round.limit;
  $panel.classList.add('door2');
  showPipe(D2.board);
  D2.cueSeen = PB.cueSerial - 1;
  PB.onAdvance = (_n, reach01) => zap(reach01);
};

hooks.door2Insert = () => {
  if (!D2.active || !D2.board) return false;
  const slot = emptySlot(D2.board);
  if (slot === null || !insertPiece(D2.board)) return false;
  pieceLand(slot, D2.board.cells[slot].rot);
  D2.phase = 'charge'; D2.charged = false;
  D2.power = 'off'; D2.lastOutcome = null;

  // 零件已自動吸附、鏡頭回正後才啟動 Door 2 自己的 20 秒與最遠站怪物。
  beginDoorRound(2, CFG.round.limit, ['refl', 'badge', 'glitch'], CFG.stations.door2Hold);
  beep('thunk');
  return true;
};

hooks.resetDoor2 = () => {
  D2.active = false; D2.board = null; D2.doneT = -1; D2.cueSeen = PB.cueSerial;
  D2.phase = 'charge'; D2.charged = false;
  D2.power = 'off'; D2.testT = 0; D2.testEnd = 0; D2.lastOutcome = null;
  D2.shortCount = 0; D2.openCount = 0; D2.chargeCount = 0; D2.dischargeCount = 0;
  D2.resetPhaseAfterTrip = false;
  PB.onAdvance = null;
  clearTrip();
  $panel.classList.remove('door2');
};

/** 按下主斷路器；目前階段決定電流是在充電，還是在嘗試退開門閂。 */
export function testDoor2() {
  if (!D2.active || !D2.board || D2.doneT >= 0 || R.over || D2.power !== 'off') return false;
  if (emptySlot(D2.board) !== null) {
    cueMissingPiece();
    beep('thunk');
    return false;
  }
  const trace = tracePhase(D2.board, D2.phase);
  D2.lastOutcome = trace.outcome;
  D2.power = 'testing';
  D2.testT = 0;
  D2.testEnd = Math.max(0.38, trace.path.length * TEST_CELL_SEC + 0.16);
  PB.lit = 0; PB.prevLen = 0; PB.sparkT = 0;
  beep('release');
  T.t = 0;
  return true;
}

pipeCanvas.addEventListener('pointerdown', e => {
  if (!D2.active || !D2.board || D2.doneT >= 0 || R.over) return;
  if (T.phase !== 'door2' || blind() || interrupted()) return;

  if (testAt(e.clientX, e.clientY)) {
    testDoor2();
    return;
  }
  if (D2.power !== 'off') return;
  const i = cellAt(e.clientX, e.clientY);
  if (i === null) return;
  if (canRotate(D2.board, i) && rotate(D2.board, i)) {
    spinCell(i, D2.board.cells[i]);
    beep('release');
    D2.lastOutcome = null;
    T.t = 0;
  } else if (D2.board.cells[i]?.kind === 'empty') {
    beep('thunk');
    cueMissingPiece();
  } else {
    beep('thunk'); // 固定管線有實體感，但不接受沒有意義的亂轉。
  }
});

/** 每幀由 loop 呼叫。lampF 是走廊燈的即時亮度。 */
export function updateDoor2(dt, lampF) {
  if (!D2.active || !D2.board) return;
  drawPipe(D2.board, dt, lampF, D2.power, D2.phase, D2.charged);

  const cueF = missingCueLevel();
  if (PB.cueSerial !== D2.cueSeen) {
    D2.cueSeen = PB.cueSerial;
    beep('falseSet');
  }
  if (cueF > 0) markerLight.intensity = Math.max(markerLight.intensity, 0.8 + cueF * 2.8);

  const liveUnlock = D2.phase === 'unlock' &&
    (D2.power === 'testing' || D2.power === 'solved');
  setDoorPanel(liveUnlock ? phaseReach(D2.board, 'unlock') : 0,
    D2.doneT >= 0, lampF, performance.now() / 1000);

  if (D2.power === 'testing') {
    D2.testT += dt;
    if (D2.testT >= D2.testEnd) {
      if (D2.phase === 'charge' && D2.lastOutcome === 'charged') {
        D2.charged = true; D2.chargeCount++;
        D2.phase = 'unlock'; D2.power = 'switching'; D2.testT = 0;
        beep('set');
      } else if (D2.phase === 'unlock' && D2.lastOutcome === 'solved' && completeDoor()) {
        D2.power = 'solved';
        D2.doneT = 0;
      } else if (D2.lastOutcome === 'short' || D2.lastOutcome === 'bypass') {
        D2.power = 'trip'; D2.testT = 0; D2.shortCount++;
        D2.resetPhaseAfterTrip = D2.phase === 'unlock';
        $trip.classList.add('on');
        beep('severe');
      } else {
        D2.power = 'open'; D2.testT = 0; D2.openCount++;
        beep('error');
      }
    }
  } else if (D2.power === 'switching') {
    D2.testT += dt;
    if (D2.testT >= RELAY_HOLD_SEC) {
      D2.power = 'off'; D2.testT = 0; D2.lastOutcome = null;
      beep('thunk');
    }
  } else if (D2.power === 'open') {
    D2.testT += dt;
    if (D2.testT >= OPEN_HOLD_SEC) { D2.power = 'off'; D2.testT = 0; }
  } else if (D2.power === 'trip') {
    D2.testT += dt;
    if (D2.testT >= TRIP_HOLD_SEC) {
      clearTrip();
      if (D2.resetPhaseAfterTrip) {
        D2.phase = 'charge'; D2.charged = false; D2.dischargeCount++;
      }
      D2.resetPhaseAfterTrip = false;
      D2.power = 'off'; D2.testT = 0; D2.lastOutcome = null;
    }
  }

  if (D2.doneT >= 0) {
    D2.doneT += dt;
    if (D2.doneT >= 1.2) {
      hooks.resetDoor2();
      hooks.startDoor3?.();
    }
  }
}
