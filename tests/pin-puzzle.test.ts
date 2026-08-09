import { describe, expect, it } from 'vitest';
import {
  arithmeticRemovalIndices, createPinPuzzle, inferPinOrder,
  invalidPuzzlePins, isArithmeticProgression,
} from '../src/logic/pin-puzzle';
import { mulberry32 } from '../src/logic/rng';

const TRUE = [2, 0, 3] as const;

describe('門 1 單來源圖形等差推理', () => {
  it('牆上四個線索直接且不重複地使用四個撞針圖形', () => {
    for (let seed = 0; seed < 500; seed++) {
      const puzzle = createPinPuzzle(1, TRUE, mulberry32(seed));
      expect(puzzle.clues.map(clue => clue.pin).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
      expect(puzzle.clues.every(clue => clue.count >= 1 && clue.count <= 5)).toBe(true);
      expect((puzzle.clues.find(clue => clue.pin === puzzle.falsePin)?.count ?? -1) % 2).toBe(0);
    }
  });

  it('任何種子都只有移除真實假針後形成 1、3、5 等差數列', () => {
    for (let seed = 0; seed < 500; seed++) {
      const falsePin = seed % 4;
      const order = [0, 1, 2, 3].filter(pin => pin !== falsePin);
      const puzzle = createPinPuzzle(falsePin, order, mulberry32(seed));
      const removals = arithmeticRemovalIndices(puzzle.clues.map(clue => clue.count));
      expect(removals).toHaveLength(1);
      expect(puzzle.clues[removals[0]!]?.pin).toBe(falsePin);
      const survivors = puzzle.clues.filter((_, index) => index !== removals[0]).map(clue => clue.count);
      expect(survivors).toEqual([1, 3, 5]);
      expect(isArithmeticProgression(survivors)).toBe(true);
      expect(invalidPuzzlePins(puzzle)).toEqual([falsePin]);
    }
  });

  it('移除違規圖形後的牆面順序就是原 trueOrder', () => {
    for (let seed = 0; seed < 500; seed++) {
      const falsePin = seed % 4;
      const order = [3, 1, 0, 2].filter(pin => pin !== falsePin);
      const puzzle = createPinPuzzle(falsePin, order, mulberry32(seed));
      expect(inferPinOrder(puzzle)).toEqual(order);
    }
  });

  it('資料只含牆面圖形線索，不再需要門面刻痕或缺格轉譯', () => {
    const puzzle = createPinPuzzle(1, TRUE, mulberry32(7));
    expect(puzzle.ruleId).toBe('graphic-arithmetic');
    expect(puzzle.difference).toBe(2);
    expect(puzzle.clues).toHaveLength(4);
    expect(puzzle).not.toHaveProperty('doorMarks');
    expect(puzzle).not.toHaveProperty('wallSequence');
    expect(arithmeticRemovalIndices([1, 2, 3, 4])).toEqual([0, 3]);
  });

  it('同一種子生成同一組圖形順序、刻點與筆跡種子', () => {
    const a = createPinPuzzle(1, TRUE, mulberry32(1337));
    const b = createPinPuzzle(1, TRUE, mulberry32(1337));
    expect(a).toEqual(b);
  });

  it('拒絕重複、遺漏、越界或不是四針的配置', () => {
    expect(() => createPinPuzzle(1, [0, 1, 3], mulberry32(1))).toThrow(RangeError);
    expect(() => createPinPuzzle(4, [0, 1, 2], mulberry32(1))).toThrow(RangeError);
    expect(() => createPinPuzzle(1, [0, 2], mulberry32(1))).toThrow(RangeError);
  });
});
