/** 門 1 的單來源圖形等差推理：牆面直接使用撞針圖形；移除唯一違規圖形後，
 * 其刻點數形成等差數列，剩餘圖形由左到右就是撬鎖順序。 */
import type { PinIndex } from './pins';

export type PinPuzzleRuleId = 'graphic-arithmetic';

export interface PinPuzzleClue {
  readonly pin: PinIndex;
  readonly count: number;
}

export interface PinPuzzle {
  readonly ruleId: PinPuzzleRuleId;
  readonly falsePin: PinIndex;
  /** 牆面由左到右；圖形就是撞針身分，count 是周圍刻點數。 */
  readonly clues: readonly PinPuzzleClue[];
  readonly difference: 2;
  readonly wallSeed: number;
}

export function isArithmeticProgression(values: readonly number[]): boolean {
  if (values.length < 3) return false;
  const difference = values[1]! - values[0]!;
  return difference > 0 && values.slice(2).every((value, index) =>
    value - values[index + 1]! === difference);
}

export function arithmeticRemovalIndices(values: readonly number[]): number[] {
  return values.flatMap((_, index) =>
    isArithmeticProgression(values.filter((__, candidate) => candidate !== index)) ? [index] : []);
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

  const trueCounts = [1, 3, 5] as const;
  const falseIndex = Math.floor(rng() * pinCount);
  const displayPins = [...trueOrder];
  displayPins.splice(falseIndex, 0, falsePin);
  const candidates = [2, 4].filter(candidate => {
    const counts = displayPins.map(pin => pin === falsePin
      ? candidate : trueCounts[trueOrder.indexOf(pin)]!);
    const removals = arithmeticRemovalIndices(counts);
    return removals.length === 1 && removals[0] === falseIndex;
  });
  if (!candidates.length) throw new Error('無法建立唯一解的門 1 圖形等差題目');
  const falseCount = candidates[Math.floor(rng() * candidates.length)]!;
  const clues = displayPins.map(pin => ({
    pin,
    count: pin === falsePin ? falseCount : trueCounts[trueOrder.indexOf(pin)]!,
  }));

  return {
    ruleId: 'graphic-arithmetic',
    falsePin,
    clues,
    difference: 2,
    wallSeed: Math.floor(rng() * 0x7fffffff),
  };
}

export function inferPinOrder(puzzle: PinPuzzle): PinIndex[] {
  const invalid = invalidPuzzlePins(puzzle);
  if (invalid.length !== 1) throw new Error('門 1 圖形等差題目沒有唯一違規圖形');
  return puzzle.clues.filter(clue => clue.pin !== invalid[0]).map(clue => clue.pin);
}

export function invalidPuzzlePins(puzzle: PinPuzzle): PinIndex[] {
  const indices = arithmeticRemovalIndices(puzzle.clues.map(clue => clue.count));
  return indices.map(index => puzzle.clues[index]!.pin);
}
