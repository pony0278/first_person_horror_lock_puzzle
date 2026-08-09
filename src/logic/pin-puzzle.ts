/** 門 1 的缺格位置序列：同一條五點軌道上的標記由一端等距移到另一端。
 * 玩家補回中央位置，再依完整序列撬動三根真針。 */
import type { PinIndex } from './pins';

export type PinPuzzleRuleId = 'missing-position-sequence';
export type PinPuzzleMark = 'left' | 'near-left' | 'center' | 'near-right' | 'right';

export interface PinPuzzleClue {
  /** 空缺格不暴露對應撞針；玩家必須從門上的候選軌道推回來。 */
  readonly pin: PinIndex | null;
  readonly mark: PinPuzzleMark | null;
  readonly missing: boolean;
}

export interface PinPuzzle {
  readonly ruleId: PinPuzzleRuleId;
  readonly falsePin: PinIndex;
  /** 牆面由左到右；固定只有中間一格缺失。 */
  readonly clues: readonly [PinPuzzleClue, PinPuzzleClue, PinPuzzleClue];
  /** 以撞針索引查出門鎖上五點軌道的標記位置。 */
  readonly pinMarks: readonly PinPuzzleMark[];
  readonly missingIndex: 1;
  /** 標記每格跨越兩個錨點；正反向皆可能。 */
  readonly step: 2 | -2;
  readonly wallSeed: number;
}

export function markPosition(mark: PinPuzzleMark): number {
  if (mark === 'left') return -2;
  if (mark === 'near-left') return -1;
  if (mark === 'center') return 0;
  if (mark === 'near-right') return 1;
  return 2;
}

export function createPinPuzzle(falsePin: PinIndex, trueOrder: readonly PinIndex[],
                                rng: () => number = Math.random): PinPuzzle {
  const pinCount = trueOrder.length + 1;
  const all = [...trueOrder, falsePin].sort((a, b) => a - b);
  const expectedPins = [...Array(pinCount).keys()];
  if (pinCount !== 4 || !Number.isInteger(falsePin) || falsePin < 0 ||
      all.length !== new Set(all).size || all.some((pin, i) => pin !== expectedPins[i])) {
    throw new RangeError('門 1 必須由三根真針與一根假針恰好涵蓋 0～3，且不得重複');
  }

  const step = rng() < 0.5 ? 2 : -2;
  const sequence: readonly PinPuzzleMark[] = step === 2
    ? ['left', 'center', 'right']
    : ['right', 'center', 'left'];
  const distractor: PinPuzzleMark = rng() < 0.5 ? 'near-left' : 'near-right';
  const pinMarks: PinPuzzleMark[] = Array(pinCount).fill(distractor);
  trueOrder.forEach((pin, index) => { pinMarks[pin] = sequence[index]!; });
  pinMarks[falsePin] = distractor;

  return {
    ruleId: 'missing-position-sequence',
    falsePin,
    clues: [
      { pin: trueOrder[0]!, mark: sequence[0]!, missing: false },
      { pin: null, mark: null, missing: true },
      { pin: trueOrder[2]!, mark: sequence[2]!, missing: false },
    ],
    pinMarks,
    missingIndex: 1,
    step,
    wallSeed: Math.floor(rng() * 0x7fffffff),
  };
}

export function missingPuzzlePins(puzzle: PinPuzzle): PinIndex[] {
  const missing = puzzle.clues.flatMap((clue, index) => clue.missing ? [index] : []);
  if (missing.length !== 1 || missing[0] !== puzzle.missingIndex) return [];
  const before = puzzle.clues[puzzle.missingIndex - 1]?.mark;
  const after = puzzle.clues[puzzle.missingIndex + 1]?.mark;
  if (!before || !after) return [];
  const expectedPosition = (markPosition(before) + markPosition(after)) / 2;
  const visiblePins = new Set(puzzle.clues.flatMap(clue => clue.pin === null ? [] : [clue.pin]));
  return puzzle.pinMarks.flatMap((mark, pin) =>
    !visiblePins.has(pin) && markPosition(mark) === expectedPosition ? [pin] : []);
}

export function inferPinOrder(puzzle: PinPuzzle): PinIndex[] {
  const missingPins = missingPuzzlePins(puzzle);
  if (missingPins.length !== 1) throw new Error('門 1 缺格位置序列沒有唯一答案');
  return puzzle.clues.map(clue => clue.pin ?? missingPins[0]!);
}