/* Door 2: dual-line emergency repair.
   The wall fuse is collected before the chase starts. Once inserted it powers
   the red/blue rails and runs one free diagnostic pulse. Four physical switches
   toggle straight/cross routing. The first submitted fault burns the fuse,
   cold-resets the switches and forces one final pickup; the second fault kills. */

import {
  applyCircuitSolution, canToggleSwitch, coldResetCircuit, emptyFuseSlot, fuseFaultDisposition,
  insertFuse, newCircuit, pickCircuitSpec,
  isCircuitSolved, solveCircuit, toggleSwitch, traceCircuit,
} from '../logic/circuit.js';
import { $panel, $trip } from '../dom.js';
import {
  CB, FLOW_STAGE_SEC, breakerAt, breakerCentreClient, circuitCanvas,
  cueMissingFuse, drawCircuit, fuseLand, kickSwitch, missingFuseCueLevel,
  showCircuit, switchAt, switchCentreClient,
} from '../render/circuitboard.js';
import { setDoorPanel } from '../render/doorpanel.js';
import { markerLight } from '../render/hintwall.js';
import { CFG } from '../logic/config.js';
import { R, ST, blind, hooks } from '../state.js';
import { beep, zap } from './audio.js';
import { interrupted } from './halt.js';
import { beginDoorRound, completeDoor, die } from './round.js';
import { T, stageDoor2SpareFuse } from './transit.js';

const BOOT_SEC = 0.46;
const TRIP_HOLD_SEC = 0.96;
const RESULT_HOLD_SEC = 0.16;
const FUSE_PICKUP_PAUSE = 'door2-fuse-pickup';

export const D2 = {
  active: false, board: null, doneT: -1, cueSeen: 0,
  phase: 'repair', power: 'off', testT: 0, testEnd: 0,
  lastTrace: null, lastOutcome: null, lastAutomatic: false,
  tests: 0, autoTests: 0, failCount: 0,
  fuseNumber: 0, burnouts: 0, awaitingFuse: false, scorchedGate: null,
};

hooks.door2HasPiece = () => Boolean(D2.board?.fuseInstalled);
hooks.door2Burnouts = () => D2.burnouts;

function clearTrip() {
  $trip.classList.remove('on');
}

hooks.startDoor2 = () => {
  D2.board = hooks.makeDoor2Board?.() ?? newCircuit(pickCircuitSpec());
  D2.active = true; D2.doneT = -1;
  D2.phase = 'repair'; D2.power = 'off'; D2.testT = 0; D2.testEnd = 0;
  D2.lastTrace = null; D2.lastOutcome = null; D2.lastAutomatic = false;
  D2.tests = 0; D2.autoTests = 0; D2.failCount = 0;
  D2.fuseNumber = 0; D2.burnouts = 0; D2.awaitingFuse = true; D2.scorchedGate = null;
  clearTrip();

  // Door 1's completed round stays paused until the fuse physically lands.
  R.door = 2; R.limit = CFG.round.limit;
  $panel.classList.add('door2');
  showCircuit();
  D2.cueSeen = CB.cueSerial - 1;
  CB.onAdvance = (_step, reach01) => zap(reach01);
};

hooks.door2Insert = () => {
  if (!D2.active || !D2.board || !insertFuse(D2.board)) return false;
  D2.fuseNumber++;
  D2.awaitingFuse = false;
  fuseLand();
  D2.power = D2.fuseNumber === 1 ? 'boot' : 'reboot';
  D2.testT = 0; D2.lastTrace = null; D2.lastOutcome = null; D2.lastAutomatic = false;

  if (D2.fuseNumber === 1) {
    // The 20-second chase begins only after the first wall fuse is safely landed.
    beginDoorRound(2, CFG.round.limit, ['refl', 'badge', 'glitch'], CFG.stations.door2Hold);
  } else {
    // A cold restart keeps elapsed time and the advanced monster position.
    // Only the mandatory pickup interval is free.
    R.timer.resume(FUSE_PICKUP_PAUSE);
  }
  beep('thunk');
  return true;
};

hooks.resetDoor2 = () => {
  D2.active = false; D2.board = null; D2.doneT = -1; D2.cueSeen = CB.cueSerial;
  D2.phase = 'repair'; D2.power = 'off'; D2.testT = 0; D2.testEnd = 0;
  D2.lastTrace = null; D2.lastOutcome = null; D2.lastAutomatic = false;
  D2.tests = 0; D2.autoTests = 0; D2.failCount = 0;
  D2.fuseNumber = 0; D2.burnouts = 0; D2.awaitingFuse = false; D2.scorchedGate = null;
  R.timer.resume(FUSE_PICKUP_PAUSE);
  CB.onAdvance = null;
  clearTrip();
  $panel.classList.remove('door2');
};

function beginDiagnostic(automatic = false) {
  if (!D2.active || !D2.board || D2.doneT >= 0 || R.over || D2.power !== 'off') return false;
  if (emptyFuseSlot(D2.board) !== null) {
    cueMissingFuse();
    beep('thunk');
    return false;
  }
  const trace = traceCircuit(D2.board);
  D2.lastTrace = trace;
  D2.lastOutcome = trace.outcome;
  D2.power = 'testing';
  D2.testT = 0;
  D2.testEnd = Math.max(0.42, trace.stages.length * FLOW_STAGE_SEC + RESULT_HOLD_SEC);
  D2.tests++;
  D2.lastAutomatic = automatic;
  if (automatic) D2.autoTests++;
  CB.flow = 0; CB.previousStep = 0; CB.sparkT = 0;
  beep('release');
  T.t = 0;
  return true;
}

function advanceMonsterOneStation() {
  const S = CFG.stations;
  ST.index = Math.min(S.z.length - 1, ST.index + 1);
  ST.z = ST.targetZ = S.z[ST.index];
  ST.moveT = 0; ST.pendingJump = false; ST.stareT = 0;
  ST.blink = S.blinkSec; ST.seen = false;
  // The pickup is a guaranteed second chance, so a face/lurk sequence cannot
  // finish during the mandatory animation. It resumes after the spare lands.
  ST.phase = 'off'; ST.emptyGot = 0; ST.glanceT = 0; ST.counted = false;
  ST.readyOff = false; ST.armedT = 0; ST.faceT = 0;
}

function burnFirstFuse() {
  if (!D2.board) return;
  D2.failCount++; D2.burnouts++;
  D2.scorchedGate = D2.lastTrace?.fault ?? D2.scorchedGate;
  coldResetCircuit(D2.board);
  D2.awaitingFuse = true;
  D2.power = 'burnout'; D2.testT = 0;
  R.timer.pause(FUSE_PICKUP_PAUSE);
  advanceMonsterOneStation();
  $trip.classList.add('on');
  beep('severe');
}

function burnFinalFuse() {
  if (!D2.board) return;
  D2.failCount++; D2.burnouts++;
  D2.scorchedGate = D2.lastTrace?.fault ?? D2.scorchedGate;
  coldResetCircuit(D2.board);
  D2.power = 'fatal'; D2.testT = 0;
  $trip.classList.add('on');
  beep('severe');
}

/** Pull the right-hand breaker. The first diagnostic after fuse insertion is automatic. */
export function testDoor2() {
  return beginDiagnostic(false);
}

/** Debug-only shortcut that still leaves submission to the real breaker flow. */
export function setDoor2Answer(solved) {
  if (!D2.active || !D2.board || D2.doneT >= 0 || R.over || D2.power !== 'off') return false;
  if (solved) applyCircuitSolution(D2.board);
  else if (isCircuitSolved(D2.board)) toggleSwitch(D2.board, 0);
  D2.lastTrace = null;
  D2.lastOutcome = null;
  return solved ? isCircuitSolved(D2.board) : !isCircuitSolved(D2.board);
}

circuitCanvas.addEventListener('pointerdown', e => {
  if (!D2.active || !D2.board || D2.doneT >= 0 || R.over) return;
  if (T.phase !== 'door2' || blind() || interrupted()) return;

  if (breakerAt(e.clientX, e.clientY)) {
    testDoor2();
    return;
  }
  if (D2.power !== 'off') return;
  const index = switchAt(e.clientX, e.clientY);
  if (index === null) {
    if (emptyFuseSlot(D2.board) !== null) cueMissingFuse();
    return;
  }
  if (canToggleSwitch(D2.board, index) && toggleSwitch(D2.board, index)) {
    kickSwitch(index);
    D2.lastTrace = null; D2.lastOutcome = null;
    beep('release');
    T.t = 0;
  } else {
    cueMissingFuse();
    beep('thunk');
  }
});

/** Called once per frame. lampF is the corridor's current light level. */
export function updateDoor2(dt, lampF) {
  if (!D2.active || !D2.board) return;
  drawCircuit(D2.board, dt, lampF, D2.power, D2.lastTrace, D2.scorchedGate);

  const cueF = missingFuseCueLevel();
  if (CB.cueSerial !== D2.cueSeen) {
    D2.cueSeen = CB.cueSerial;
    beep('falseSet');
  }
  if (cueF > 0) markerLight.intensity = Math.max(markerLight.intensity, 0.8 + cueF * 2.8);

  const reach = D2.power === 'testing' || D2.power === 'solved'
    ? Math.min(1, CB.flow / 4) : 0;
  setDoorPanel(reach, D2.doneT >= 0, lampF, performance.now() / 1000);

  if (D2.power === 'boot' || D2.power === 'reboot') {
    D2.testT += dt;
    if (D2.testT >= BOOT_SEC) {
      const automatic = D2.power === 'boot';
      D2.power = 'off'; D2.testT = 0;
      if (automatic) beginDiagnostic(true); // the spare never grants another free diagnosis
    }
  } else if (D2.power === 'testing') {
    D2.testT += dt;
    if (D2.testT >= D2.testEnd) {
      if (D2.lastOutcome === 'solved' && completeDoor()) {
        D2.power = 'solved';
        D2.doneT = 0;
      } else if (fuseFaultDisposition(D2.lastAutomatic, D2.fuseNumber) === 'free-diagnostic') {
        // The automatic pulse teaches Gate A. It may flicker, but cannot consume
        // the player's first and only recoverable fuse failure.
        D2.power = 'trip'; D2.testT = 0;
        $trip.classList.add('on');
        beep('severe');
      } else if (fuseFaultDisposition(false, D2.fuseNumber) === 'burnout') {
        burnFirstFuse();
      } else {
        burnFinalFuse();
      }
    }
  } else if (D2.power === 'trip') {
    D2.testT += dt;
    if (D2.testT >= TRIP_HOLD_SEC) {
      clearTrip();
      D2.power = 'off'; D2.testT = 0;
    }
  } else if (D2.power === 'burnout') {
    D2.testT += dt;
    if (D2.testT >= TRIP_HOLD_SEC) {
      clearTrip();
      D2.power = 'off'; D2.testT = 0;
      cueMissingFuse();
      stageDoor2SpareFuse();
    }
  } else if (D2.power === 'fatal') {
    D2.testT += dt;
    if (D2.testT >= TRIP_HOLD_SEC) {
      clearTrip();
      die();
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

export { breakerCentreClient, switchCentreClient };
