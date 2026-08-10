/**
 * Door 2 dual-line diagnostic circuit.
 *
 * A red and a blue signal enter on separate rails. Each of the four switches
 * either keeps both rails straight (0) or crosses them (1). A ceramic gate
 * after every switch checks which signal is on its upper contact. The test
 * pulse stops at the first mismatch, so failure localises the faulty section
 * without spelling out which switch position is correct.
 */

import { mulberry32 } from './rng';

export type SwitchState = 0 | 1;
export type Rail = 0 | 1;
export type Signal = 'red' | 'blue';
export type CircuitOutcome = 'missing' | 'fault' | 'solved';
export type FuseFaultDisposition = 'free-diagnostic' | 'burnout' | 'fatal';

export interface CircuitSpec {
  readonly id: string;
  /** Expected red-signal rail after switches A, B, C and D. */
  readonly targets: readonly [Rail, Rail, Rail, Rail];
  readonly note: string;
}

export interface Gate {
  readonly top: Signal;
  readonly bottom: Signal;
}

export interface CircuitBoard {
  readonly id: string;
  readonly switches: SwitchState[];
  /** Curated opening state restored after the first fuse burns out. */
  readonly initial: readonly [SwitchState, SwitchState, SwitchState, SwitchState];
  readonly solution: readonly [SwitchState, SwitchState, SwitchState, SwitchState];
  readonly gates: readonly [Gate, Gate, Gate, Gate];
  fuseInstalled: boolean;
}

export interface TraceStage {
  readonly index: number;
  readonly before: Rail;
  readonly after: Rail;
  readonly expected: Rail;
  readonly passed: boolean;
}

export interface CircuitTrace {
  readonly outcome: CircuitOutcome;
  readonly fault: number | null;
  readonly passed: readonly number[];
  /** Contains every stage reached by the pulse, including the failed stage. */
  readonly stages: readonly TraceStage[];
}

export interface CircuitSolution {
  readonly states: readonly [SwitchState, SwitchState, SwitchState, SwitchState];
  readonly cost: number;
}

/** Curated boards avoid an all-straight/all-cross answer and always finish red-over-blue. */
export const CIRCUIT_POOL: readonly CircuitSpec[] = [
  { id: 'cross-weave', targets: [1, 1, 0, 0], note: 'cross, straight, cross, straight' },
  { id: 'late-return', targets: [0, 1, 1, 0], note: 'straight, cross, straight, cross' },
  { id: 'double-cross', targets: [1, 0, 0, 0], note: 'cross twice, then hold' },
  { id: 'end-cross', targets: [0, 0, 1, 0], note: 'hold twice, cross twice' },
] as const;

/** Exactly three wrong switches, always including A so the free first diagnosis teaches the rule. */
const SCRAMBLES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [0, 1, 3],
  [0, 2, 3],
] as const;

const opposite = (signal: Signal): Signal => signal === 'red' ? 'blue' : 'red';
const asState = (value: number): SwitchState => (value & 1) as SwitchState;

export function solutionFor(spec: CircuitSpec): [SwitchState, SwitchState, SwitchState, SwitchState] {
  let previous: Rail = 0;
  return spec.targets.map(target => {
    const state = asState(previous ^ target);
    previous = target;
    return state;
  }) as [SwitchState, SwitchState, SwitchState, SwitchState];
}

export function gatesFor(spec: CircuitSpec): [Gate, Gate, Gate, Gate] {
  return spec.targets.map(redRail => ({
    top: redRail === 0 ? 'red' : 'blue',
    bottom: opposite(redRail === 0 ? 'red' : 'blue'),
  })) as [Gate, Gate, Gate, Gate];
}

export function pickCircuitSpec(random: () => number = Math.random): CircuitSpec {
  return CIRCUIT_POOL[Math.floor(random() * CIRCUIT_POOL.length)] ?? CIRCUIT_POOL[0]!;
}

export function newCircuit(
  spec: CircuitSpec = pickCircuitSpec(),
  random: () => number = Math.random,
): CircuitBoard {
  const solution = solutionFor(spec);
  const switches = [...solution] as SwitchState[];
  const scramble = SCRAMBLES[Math.floor(random() * SCRAMBLES.length)] ?? SCRAMBLES[0]!;
  for (const index of scramble) switches[index] = asState((switches[index] ?? 0) ^ 1);
  return {
    id: spec.id,
    switches,
    initial: [...switches] as [SwitchState, SwitchState, SwitchState, SwitchState],
    solution,
    gates: gatesFor(spec),
    fuseInstalled: false,
  };
}

export function traceCircuit(board: CircuitBoard): CircuitTrace {
  if (!board.fuseInstalled) return { outcome: 'missing', fault: null, passed: [], stages: [] };

  let redRail: Rail = 0;
  const stages: TraceStage[] = [];
  const passed: number[] = [];
  for (let index = 0; index < board.switches.length; index++) {
    const before = redRail;
    if (board.switches[index] === 1) redRail = (1 - redRail) as Rail;
    const gate = board.gates[index];
    const expected: Rail = gate?.top === 'red' ? 0 : 1;
    const ok = redRail === expected;
    stages.push({ index, before, after: redRail, expected, passed: ok });
    if (!ok) return { outcome: 'fault', fault: index, passed, stages };
    passed.push(index);
  }
  return { outcome: 'solved', fault: null, passed, stages };
}

export function solveCircuit(board: CircuitBoard): CircuitSolution | null {
  if (!board.fuseInstalled) return null;
  let cost = 0;
  for (let i = 0; i < board.solution.length; i++) {
    if (board.switches[i] !== board.solution[i]) cost++;
  }
  return { states: [...board.solution] as CircuitSolution['states'], cost };
}

export const isCircuitSolved = (board: CircuitBoard): boolean => traceCircuit(board).outcome === 'solved';
export const emptyFuseSlot = (board: CircuitBoard): number | null => board.fuseInstalled ? null : 0;

export function insertFuse(board: CircuitBoard): boolean {
  if (board.fuseInstalled) return false;
  board.fuseInstalled = true;
  return true;
}

/**
 * Burn the installed fuse and restore only the physical switch positions.
 * The board identity, gate targets and solution stay unchanged, so the player
 * keeps every fact learned from the failed diagnostic instead of receiving a
 * different puzzle.
 */
export function coldResetCircuit(board: CircuitBoard): boolean {
  if (!board.fuseInstalled) return false;
  board.fuseInstalled = false;
  board.switches.splice(0, board.switches.length, ...board.initial);
  return true;
}

/** Automatic teaching pulse is free; one replacement fuse is the hard limit. */
export function fuseFaultDisposition(automatic: boolean, fuseNumber: number): FuseFaultDisposition {
  if (automatic) return 'free-diagnostic';
  return fuseNumber <= 1 ? 'burnout' : 'fatal';
}

export function canToggleSwitch(board: CircuitBoard, index: number): boolean {
  return board.fuseInstalled && Number.isInteger(index) && index >= 0 && index < board.switches.length;
}

export function toggleSwitch(board: CircuitBoard, index: number): boolean {
  if (!canToggleSwitch(board, index)) return false;
  board.switches[index] = asState((board.switches[index] ?? 0) ^ 1);
  return true;
}

export function applyCircuitSolution(board: CircuitBoard): boolean {
  if (!board.fuseInstalled) return false;
  board.switches.splice(0, board.switches.length, ...board.solution);
  return isCircuitSolved(board);
}

export function seededCircuit(seed: number): CircuitBoard {
  const random = mulberry32(seed);
  return newCircuit(pickCircuitSpec(random), random);
}
