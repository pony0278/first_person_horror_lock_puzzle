/**
 * 門 1 的雙來源推理：牆上四個等距位置顯示 1、2、遭抹除、4 道刻痕；
 * 門上把 1～4 道刻痕分別綁到四個撞針符號。玩家補出遭抹除的是 3，
 * 排除它對應的假針，再依牆面留下的 1→2→4 查回撬鎖順序。
 */
import type { PinIndex } from './pins';

export type PinPuzzleRuleId = 'erased-sequence';

export interface PinPuzzleMark {
  readonly pin: PinIndex;
  readonly count: number;
}

export interface PinPuzzle {
  readonly ruleId: PinPuzzleRuleId;
  readonly falsePin: PinIndex;
  readonly wallSequence: readonly [1, 2, null, 4];
  readonly erasedCount: 3;
  /** 依撞針位置排序的門上符號／刻痕對照。 */
  readonly doorMarks: readonly PinPuzzleMark[];
  readonly wallSeed: number;
}

export function createPinPuzzle(falsePin: PinIndex, trueOrder: readonly PinIndex[],
                                rng: () => number = Math.random): PinPuzzle {
  const pinCount = trueOrder.length + 1;
  const all = [...trueOrder, falsePin].sort((a, b) => a - b);
  const expectedPins = [...Array(pinCount).keys()];
  if (!Number.isInteger(falsePin) || falsePin < 0 ||
      all.length !== new Set(all).size || all.some((pin, i) => pin !== expectedPins[i])) {
    throw new RangeError('假針與真針順序必須恰好涵蓋所有撞針，且不得重複');
  }

  const counts = [1, 2, 4];
  const doorMarks = trueOrder.map((pin, index) => ({ pin, count: counts[index]! }));
  doorMarks.push({ pin: falsePin, count: 3 });
  doorMarks.sort((a, b) => a.pin - b.pin);

  return {
    ruleId: 'erased-sequence',
    falsePin,
    wallSequence: [1, 2, null, 4],
    erasedCount: 3,
    doorMarks,
    wallSeed: Math.floor(rng() * 0x7fffffff),
  };
}

/** 依牆面由左到右留下的刻痕數量，從門上查回撞針順序。 */
export function inferPinOrder(puzzle: PinPuzzle): PinIndex[] {
  return puzzle.wallSequence.flatMap(count => count === null ? [] : [count]).map(count => {
    const mark = puzzle.doorMarks.find(item => item.count === count);
    if (!mark) throw new Error(`門上缺少 ${count} 道刻痕的撞針對照`);
    return mark.pin;
  });
}

/** 遭抹除的刻痕數量對應唯一假針。 */
export function invalidPuzzlePins(puzzle: PinPuzzle): PinIndex[] {
  return puzzle.doorMarks.filter(mark => mark.count === puzzle.erasedCount).map(mark => mark.pin);
}
