import { describe, expect, it } from 'vitest';
import {
  createPinPuzzle, inferPinOrder, missingPuzzlePins, shapeSides,
} from '../src/logic/pin-puzzle';
import { mulberry32 } from '../src/logic/rng';

const TRUE = [2, 0, 3] as const;

describe('門 1 缺格圖形序列', () => {
  it('牆面固定為兩個端點與一個明確的中央空缺', () => {
    for (let seed = 0; seed < 500; seed++) {
      const puzzle = createPinPuzzle(1, TRUE, mulberry32(seed));
      expect(puzzle.clues).toHaveLength(3);
      expect(puzzle.missingIndex).toBe(1);
      expect(puzzle.clues.map(clue => clue.missing)).toEqual([false, true, false]);
      expect(puzzle.clues[1]).toEqual({ pin: null, shape: null, missing: true });
      expect(puzzle.clues[0].shape === 'triangle' || puzzle.clues[0].shape === 'pentagon').toBe(true);
      expect(puzzle.clues[2].shape === 'triangle' || puzzle.clues[2].shape === 'pentagon').toBe(true);
    }
  });

  it('四根撞針恰好是三角形、四邊形、五邊形與圓形干擾項', () => {
    for (let seed = 0; seed < 500; seed++) {
      const falsePin = seed % 4;
      const order = [0, 1, 2, 3].filter(pin => pin !== falsePin);
      const puzzle = createPinPuzzle(falsePin, order, mulberry32(seed));
      expect([...puzzle.pinShapes].sort()).toEqual(['circle', 'pentagon', 'square', 'triangle']);
      expect(puzzle.pinShapes[falsePin]).toBe('circle');
      expect(puzzle.pinShapes[order[1]!]).toBe('square');
    }
  });

  it('只有四邊形撞針能補成邊數等差的中央缺格', () => {
    for (let seed = 0; seed < 500; seed++) {
      const falsePin = seed % 4;
      const order = [3, 1, 0, 2].filter(pin => pin !== falsePin);
      const puzzle = createPinPuzzle(falsePin, order, mulberry32(seed));
      const visibleSides = [puzzle.clues[0].shape!, puzzle.clues[2].shape!].map(shapeSides);
      expect(visibleSides).toEqual(puzzle.step === 1 ? [3, 5] : [5, 3]);
      expect(missingPuzzlePins(puzzle)).toEqual([order[1]]);
      expect(shapeSides(puzzle.pinShapes[order[1]!]!)).toBe(4);
    }
  });

  it('補回缺格後的牆面順序就是原 trueOrder', () => {
    for (let seed = 0; seed < 500; seed++) {
      const falsePin = seed % 4;
      const order = [3, 1, 0, 2].filter(pin => pin !== falsePin);
      const puzzle = createPinPuzzle(falsePin, order, mulberry32(seed));
      expect(inferPinOrder(puzzle)).toEqual(order);
    }
  });

  it('不再含刻點排除題資料，且無唯一缺格答案時拒絕推演', () => {
    const puzzle = createPinPuzzle(1, TRUE, mulberry32(7));
    expect(puzzle.ruleId).toBe('missing-shape-sequence');
    expect(puzzle).not.toHaveProperty('difference');
    expect(puzzle.clues.every(clue => !Object.hasOwn(clue, 'count'))).toBe(true);
    const ambiguous = { ...puzzle, pinShapes: puzzle.pinShapes.map((shape, pin) =>
      pin === puzzle.falsePin ? 'square' as const : shape) };
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