/* Door 2: dual-line emergency repair.
   The wall fuse is collected before the chase starts. Once inserted it powers
   the red/blue rails and runs one free diagnostic pulse. Four physical switches
   toggle straight/cross routing; every bad test costs real blackout time. */

import {
  canToggleSwitch, emptyFuseSlot, insertFuse, newCircuit, pickCircuitSpec,
  solveCircuit, toggleSwitch, traceCircuit,
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
import { R, blind, hooks } from '../state.js';
import { beep, zap } from './audio.js';
import { interrupted } from './halt.js';
import { beginDoorRound, completeDoor } from './round.js';
import { T } from './transit.js';

const BOOT_SEC = 0.46;
const TRIP_HOLD_SEC = 0.96;
const RESULT_HOLD_SEC = 0.16;

export const D2 = {
  active: false, board: null, doneT: -1, cueSeen: 0,
  phase: 'repair', power: 'off', testT: 0, testEnd: 0,
  lastTrace: null, lastOutcome: null,
  tests: 0, autoTests: 0, failCount: 0,
};

hooks.door2HasPiece = () => Boolean(D2.board?.fuseInstalled);

function clearTrip() {
  $trip.classList.remove('on');
}

hooks.startDoor2 = () => {
  D2.board = newCircuit(pickCircuitSpec());
  D2.active = true; D2.doneT = -1;
  D2.phase = 'repair'; D2.power = 'off'; D2.testT = 0; D2.testEnd = 0;
  D2.lastTrace = null; D2.lastOutcome = null;
  D2.tests = 0; D2.autoTests = 0; D2.failCount = 0;
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
  fuseLand();
  D2.power = 'boot'; D2.testT = 0; D2.lastTrace = null; D2.lastOutcome = null;

  // The 20-second chase begins only after the wall fuse is safely in the panel.
  beginDoorRound(2, CFG.round.limit, ['refl', 'badge', 'glitch'], CFG.stations.door2Hold);
  beep('thunk');
  return true;
};

hooks.resetDoor2 = () => {
  D2.active = false; D2.board = null; D2.doneT = -1; D2.cueSeen = CB.cueSerial;
  D2.phase = 'repair'; D2.power = 'off'; D2.testT = 0; D2.testEnd = 0;
  D2.lastTrace = null; D2.lastOutcome = null;
  D2.tests = 0; D2.autoTests = 0; D2.failCount = 0;
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
  if (automatic) D2.autoTests++;
  CB.flow = 0; CB.previousStep = 0; CB.sparkT = 0;
  beep('release');
  T.t = 0;
  return true;
}

/** Pull the right-hand breaker. The first diagnostic after fuse insertion is automatic. */
export function testDoor2() {
  return beginDiagnostic(false);
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
  drawCircuit(D2.board, dt, lampF, D2.power, D2.lastTrace);

  const cueF = missingFuseCueLevel();
  if (CB.cueSerial !== D2.cueSeen) {
    D2.cueSeen = CB.cueSerial;
    beep('falseSet');
  }
  if (cueF > 0) markerLight.intensity = Math.max(markerLight.intensity, 0.8 + cueF * 2.8);

  const reach = D2.power === 'testing' || D2.power === 'solved'
    ? Math.min(1, CB.flow / 4) : 0;
  setDoorPanel(reach, D2.doneT >= 0, lampF, performance.now() / 1000);

  if (D2.power === 'boot') {
    D2.testT += dt;
    if (D2.testT >= BOOT_SEC) {
      D2.power = 'off'; D2.testT = 0;
      beginDiagnostic(true); // free first diagnosis: no extra threat meter or time penalty
    }
  } else if (D2.power === 'testing') {
    D2.testT += dt;
    if (D2.testT >= D2.testEnd) {
      if (D2.lastOutcome === 'solved' && completeDoor()) {
        D2.power = 'solved';
        D2.doneT = 0;
      } else {
        D2.power = 'trip'; D2.testT = 0; D2.failCount++;
        $trip.classList.add('on');
        beep('severe');
      }
    }
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
      hooks.startDoor3?.();
    }
  }
}

export { breakerCentreClient, switchCentreClient };
