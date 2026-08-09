import { describe, expect, it } from 'vitest';
import {
  createPinPuzzle, inferPinOrder, missingPuzzlePins,
} from '../src/logic/pin-puzzle';
import { mulberry32 } from '../src/logic/rng';

const TRUE = [2, 0, 3] as const;

describe('門 1 符號＋點數中央缺格', () => {
  it('牆面固定為單排三格，中央的符號與點數一起消失', () => {
    for (let seed = 0; seed < 500; seed++) {
      const puzzle = createPinPuzzle(1, TRUE, mulberry32(seed));
      expect(puzzle.clues).toHaveLength(3);
      expect(puzzle.missingIndex).toBe(1);
      expect(puzzle.clues.map(clue => clue.missing)).toEqual([false, true, false]);
      expect(puzzle.clues[1]).toEqual({ pin: null, count: null, missing: true });
      expect(puzzle.clues[0]).toMatchObject({ pin: TRUE[0], missing: false });
      expect(puzzle.clues[2]).toMatchObject({ pin: TRUE[2], missing: false });
    }
  });

  it('四個鎖面候選各有固定符號與唯一點數，假針點數不屬於真序列', () => {
    const seenSteps = new Set<number>();
    for (let seed = 0; seed < 500; seed++) {
      const falsePin = seed % 4;
      const order = [0, 1, 2, 3].filter(pin => pin !== falsePin);
      const puzzle = createPinPuzzle(falsePin, order, mulberry32(seed));
      const trueCounts = order.map(pin => puzzle.pinCounts[pin]!);
      seenSteps.add(puzzle.step);

      expect(puzzle.pinCounts).toHaveLength(4);
      expect(new Set(puzzle.pinCounts).size).toBe(4);
      expect(puzzle.pinCounts.every(count => count >= 1 && count <= 5)).toBe(true);
      expect(trueCounts[1]! - trueCounts[0]!).toBe(puzzle.step);
      expect(trueCounts[2]! - trueCounts[1]!).toBe(puzzle.step);
      expect(trueCounts).not.toContain(puzzle.pinCounts[falsePin]);
    }
    expect([...seenSteps].sort((a, b) => a - b)).toEqual([-2, -1, 1, 2]);
  });

  it('只有點數為兩端算術中項的撞針能補進中央', () => {
    for (let seed = 0; seed < 500; seed++) {
      const falsePin = seed % 4;
      const order = [3, 1, 0, 2].filter(pin => pin !== falsePin);
      const puzzle = createPinPuzzle(falsePin, order, mulberry32(seed));
      const left = puzzle.clues[0].count!;
      const right = puzzle.clues[2].count!;
      const expected = (left + right) / 2;

      expect(puzzle.pinCounts[order[1]!]).toBe(expected);
      expect(missingPuzzlePins(puzzle)).toEqual([order[1]]);
    }
  });

  it('補回中央整格後的三個符號順序就是原 trueOrder', () => {
    for (let seed = 0; seed < 500; seed++) {
      const falsePin = seed % 4;
      const order = [3, 1, 0, 2].filter(pin => pin !== falsePin);
      const puzzle = createPinPuzzle(falsePin, order, mulberry32(seed));
      expect(inferPinOrder(puzzle)).toEqual(order);
    }
  });

  it('不再含位置軌道或多邊形轉譯資料，答案不唯一時拒絕推演', () => {
    const puzzle = createPinPuzzle(1, TRUE, mulberry32(7));
    expect(puzzle.ruleId).toBe('missing-dot-sequence');
    expect(puzzle).not.toHaveProperty('pinMarks');
    expect(puzzle).not.toHaveProperty('pinShapes');
    expect(puzzle.clues.every(clue => !Object.hasOwn(clue, 'mark'))).toBe(true);
    expect(puzzle.clues.every(clue => !Object.hasOwn(clue, 'shape'))).toBe(true);

    const expected = (puzzle.clues[0].count! + puzzle.clues[2].count!) / 2;
    const ambiguous = {
      ...puzzle,
      pinCounts: puzzle.pinCounts.map((count, pin) =>
        pin === puzzle.falsePin ? expected : count),
    };
    expect(missingPuzzlePins(ambiguous)).toHaveLength(2);
    expect(() => inferPinOrder(ambiguous)).toThrow();
  });

  it('同一種子結果固定，並拒絕重複、遺漏、越界或不是四針的配置', () => {
    const a = createPinPuzzle(1, TRUE, mulberry32(1337));
    const b = createPinPuzzle(1, TRUE, mulberry32(1337));
    expect(a).toEqual(b);
    expect(() => createPinPuzzle(1, [0, 1, 3], mulberry32(1))).toThrow(RangeError);
    expect(() => createPinPuzzle(4, [0, 1, 2], mulberry32(1))).toThrow(RangeError);
    expect(() => createPinPuzzle(1, [0, 2], mulberry32(1))).toThrow(RangeError);
  });
});