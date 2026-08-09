/* 門 2：分流管線的流程層。
   玩家先在斷電狀態配置普通管與刀閘，取回共用入口的缺件，再按主斷路器測試。
   電流一次只走一條路：正確就開門、普通斷路可立即修改、焦黑端點會跳電 1.2 秒。
   跳電期間牆鐘與怪物照常前進，但不額外偷加秒，也不直接判死。 */

import { emptySlot, insertPiece, reach, rotate, traceRoute } from '../logic/pipe.js';
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
import { T, finishTransit } from './transit.js';

const OPEN_HOLD_SEC = 0.42;
const TRIP_HOLD_SEC = 1.20;
const TEST_CELL_SEC = 0.055;

export const D2 = {
  active: false, board: null, doneT: -1, cueSeen: 0,
  power: 'off', testT: 0, testEnd: 0, lastOutcome: null, shortCount: 0, openCount: 0,
};

hooks.door2HasPiece = () => Boolean(D2.board && emptySlot(D2.board) === null);

function clearTrip() {
  $trip.classList.remove('on');
}

hooks.startDoor2 = () => {
  D2.board = newBoard(pickSpec());
  D2.active = true; D2.doneT = -1;
  D2.power = 'off'; D2.testT = 0; D2.testEnd = 0; D2.lastOutcome = null;
  D2.shortCount = 0; D2.openCount = 0;
  clearTrip();

  // 奔跑不計時；抵達後才開始門 2 自己的 20 秒，怪物也從最遠站重新追。
  beginDoorRound(2, CFG.round.limit, ['refl', 'badge', 'glitch'], CFG.stations.door2Hold);
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
  D2.power = 'off'; D2.lastOutcome = null;
  beep('thunk');
  return true;
};

hooks.resetDoor2 = () => {
  D2.active = false; D2.board = null; D2.doneT = -1; D2.cueSeen = PB.cueSerial;
  D2.power = 'off'; D2.testT = 0; D2.testEnd = 0; D2.lastOutcome = null;
  D2.shortCount = 0; D2.openCount = 0;
  PB.onAdvance = null;
  clearTrip();
  $panel.classList.remove('door2');
};

/** 按下主斷路器。缺件尚未取回時只重播缺口提示，不會假裝送電。 */
export function testDoor2() {
  if (!D2.active || !D2.board || D2.doneT >= 0 || R.over || D2.power !== 'off') return false;
  if (emptySlot(D2.board) !== null) {
    cueMissingPiece();
    beep('thunk');
    return false;
  }
  const trace = traceRoute(D2.board);
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
  if (rotate(D2.board, i)) {
    spinCell(i, D2.board.cells[i]);
    beep('release');
    D2.lastOutcome = null;
    T.t = 0;
  } else if (D2.board.cells[i]?.kind === 'empty') {
    beep('thunk');
    cueMissingPiece();
  }
});

/** 每幀由 loop 呼叫。lampF 是走廊燈的即時亮度。 */
export function updateDoor2(dt, lampF) {
  if (!D2.active || !D2.board) return;
  drawPipe(D2.board, dt, lampF, D2.power);

  const cueF = missingCueLevel();
  if (PB.cueSerial !== D2.cueSeen) {
    D2.cueSeen = PB.cueSerial;
    beep('falseSet');
  }
  if (cueF > 0) markerLight.intensity = Math.max(markerLight.intensity, 0.8 + cueF * 2.8);

  const live = D2.power === 'testing' || D2.power === 'solved';
  setDoorPanel(live ? reach(D2.board) : 0, D2.doneT >= 0, lampF, performance.now() / 1000);

  if (D2.power === 'testing') {
    D2.testT += dt;
    if (D2.testT >= D2.testEnd) {
      if (D2.lastOutcome === 'solved' && completeDoor()) {
        D2.power = 'solved';
        D2.doneT = 0;
      } else if (D2.lastOutcome === 'short') {
        D2.power = 'trip'; D2.testT = 0; D2.shortCount++;
        $trip.classList.add('on');
        beep('severe');
      } else {
        D2.power = 'open'; D2.testT = 0; D2.openCount++;
        beep('error');
      }
    }
  } else if (D2.power === 'open') {
    D2.testT += dt;
    if (D2.testT >= OPEN_HOLD_SEC) { D2.power = 'off'; D2.testT = 0; }
  } else if (D2.power === 'trip') {
    D2.testT += dt;
    if (D2.testT >= TRIP_HOLD_SEC) {
      clearTrip();
      D2.power = 'off'; D2.testT = 0;
    }
  }

  if (D2.doneT >= 0) {
    D2.doneT += dt;
    if (D2.doneT >= 1.2) {
      hooks.resetDoor2();
      finishTransit('通電 —— 門 3 施工中');
    }
  }
}