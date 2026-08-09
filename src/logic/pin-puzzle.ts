/** 門 1 的符號＋點數缺格序列。
 * 牆面顯示兩個「撞針符號＋點數」端點；玩家由等差規律補回中央整格，
 * 再依完成後的三格順序撬動真針。 */
import type { PinIndex } from './pins';

export type PinPuzzleRuleId = 'missing-dot-sequence';

export interface PinPuzzleClue {
  /** 中央缺格同時隱藏符號與點數。 */
  readonly pin: PinIndex | null;
  readonly count: number | null;
  readonly missing: boolean;
}

export interface PinPuzzle {
  readonly ruleId: PinPuzzleRuleId;
  readonly falsePin: PinIndex;
  readonly clues: readonly [PinPuzzleClue, PinPuzzleClue, PinPuzzleClue];
  /** 以撞針索引查出門鎖候選下方顯示的點數。 */
  readonly pinCounts: readonly number[];
  readonly missingIndex: 1;
  readonly step: 1 | -1 | 2 | -2;
  readonly wallSeed: number;
}

const COUNT_TEMPLATES = [
  [1, 2, 3],
  [2, 3, 4],
  [3, 4, 5],
  [1, 3, 5],
] as const;

export function createPinPuzzle(falsePin: PinIndex, trueOrder: readonly PinIndex[],
                                rng: () => number = Math.random): PinPuzzle {
  const pinCount = trueOrder.length + 1;
  const all = [...trueOrder, falsePin].sort((a, b) => a - b);
  const expectedPins = [...Array(pinCount).keys()];
  if (pinCount !== 4 || !Number.isInteger(falsePin) || falsePin < 0 ||
      all.length !== new Set(all).size || all.some((pin, i) => pin !== expectedPins[i])) {
    throw new RangeError('門 1 必須由三根真針與一根假針恰好涵蓋 0～3，且不得重複');
  }

  const template = COUNT_TEMPLATES[Math.floor(rng() * COUNT_TEMPLATES.length)]!;
  const sequence: number[] = rng() < 0.5 ? [...template] : [...template].reverse();
  const remaining = [1, 2, 3, 4, 5].filter(count => !sequence.includes(count));
  const falseCount = remaining[Math.floor(rng() * remaining.length)]!;
  const pinCounts = Array(pinCount).fill(falseCount);
  trueOrder.forEach((pin, index) => { pinCounts[pin] = sequence[index]!; });

  return {
    ruleId: 'missing-dot-sequence',
    falsePin,
    clues: [
      { pin: trueOrder[0]!, count: sequence[0]!, missing: false },
      { pin: null, count: null, missing: true },
      { pin: trueOrder[2]!, count: sequence[2]!, missing: false },
    ],
    pinCounts,
    missingIndex: 1,
    step: (sequence[1]! - sequence[0]!) as 1 | -1 | 2 | -2,
    wallSeed: Math.floor(rng() * 0x7fffffff),
  };
}

export function missingPuzzlePins(puzzle: PinPuzzle): PinIndex[] {
  const missing = puzzle.clues.flatMap((clue, index) => clue.missing ? [index] : []);
  if (missing.length !== 1 || missing[0] !== puzzle.missingIndex) return [];
  const before = puzzle.clues[puzzle.missingIndex - 1]?.count;
  const after = puzzle.clues[puzzle.missingIndex + 1]?.count;
  if (before === null || before === undefined || after === null || after === undefined) return [];
  const expectedCount = (before + after) / 2;
  if (!Number.isInteger(expectedCount)) return [];
  const visiblePins = new Set(puzzle.clues.flatMap(clue => clue.pin === null ? [] : [clue.pin]));
  return puzzle.pinCounts.flatMap((count, pin) =>
    !visiblePins.has(pin) && count === expectedCount ? [pin] : []);
}

export function inferPinOrder(puzzle: PinPuzzle): PinIndex[] {
  const missingPins = missingPuzzlePins(puzzle);
  if (missingPins.length !== 1) throw new Error('門 1 符號＋點數缺格序列沒有唯一答案');
  return puzzle.clues.map(clue => clue.pin ?? missingPins[0]!);
}