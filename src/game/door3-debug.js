/* Debug-only legal Door 3 solver.
 *
 * The checkpoint deliberately uses the same source-select / target-transfer
 * actions as the player. It never writes puzzleSolved or leverUnlocked by hand.
 */
import { D3, adjustDoor3Pump, updateDoor3 } from './door3.js';

const STEP = 1 / 60;
const SOLUTION = Object.freeze([
  [1, 2],
  [0, 1],
  [1, 2],
  [2, 0],
  [1, 2],
]);

function stepUntil(label, predicate, maxSteps = 1200) {
  if (predicate()) return;
  for (let i = 0; i < maxSteps; i++) {
    updateDoor3(STEP);
    if (predicate()) return;
  }
  throw new Error(`Door 3 debug solver did not reach ${label}`);
}

function transfer(source, target) {
  if (!adjustDoor3Pump(source, -1)) {
    throw new Error(`Door 3 debug source ${source + 1} could not be selected`);
  }
  if (!adjustDoor3Pump(target, 1)) {
    throw new Error(`Door 3 debug target ${target + 1} could not receive fluid`);
  }
  stepUntil(`transfer ${source + 1}→${target + 1}`, () => D3.pump.transferT <= 0);
}

export function solveDoor3DebugPuzzle() {
  if (!D3.active || D3.phase !== 'explore') return false;
  if (D3.pump.leverUnlocked) return true;

  for (const [source, target] of SOLUTION) transfer(source, target);

  stepUntil('puzzle solved', () => D3.pump.puzzleSolved);
  stepUntil('master lever unlocked', () => D3.pump.leverUnlocked);
  return D3.pump.puzzleSolved && D3.pump.leverUnlocked;
}

export const DOOR3_DEBUG_SOLUTION = SOLUTION;
