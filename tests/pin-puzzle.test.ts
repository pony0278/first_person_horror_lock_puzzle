import { describe, expect, it } from 'vitest';
import { createPinPuzzle, inferPinOrder, invalidPuzzlePins } from '../src/logic/pin-puzzle';
import { mulberry32 } from '../src/logic/rng';

const TRUE = [2, 0, 3] as const;

describe('門 1 雙來源缺格推理', () => {
  it('門上四個撞針恰好對應 1～4 道刻痕', () => {
    for (let seed = 0; seed < 500; seed++) {
      const puzzle = createPinPuzzle(1, TRUE, mulberry32(seed));
      expect(puzzle.doorMarks.map(mark => mark.pin)).toEqual([0, 1, 2, 3]);
      expect(puzzle.doorMarks.map(mark => mark.count).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    }
  });

  it('三道刻痕唯一對應鎖內假針', () => {
    for (let seed = 0; seed < 500; seed++) {
      const falsePin = seed % 4;
      const order = [0, 1, 2, 3].filter(pin => pin !== falsePin);
      const puzzle = createPinPuzzle(falsePin, order, mulberry32(seed));
      expect(invalidPuzzlePins(puzzle)).toEqual([falsePin]);
      expect(puzzle.doorMarks.find(mark => mark.pin === falsePin)?.count).toBe(3);
    }
  });

  it('依牆上 1／2／抹除位／4 的剩餘順序查門面，可還原 trueOrder', () => {
    for (let seed = 0; seed < 500; seed++) {
      const falsePin = seed % 4;
      const order = [3, 1, 0, 2].filter(pin => pin !== falsePin);
      const puzzle = createPinPuzzle(falsePin, order, mulberry32(seed));
      expect(inferPinOrder(puzzle)).toEqual(order);
    }
  });

  it('牆上是等距缺格序列，第三位遭抹除但不直接給撞針符號', () => {
    const puzzle = createPinPuzzle(1, TRUE, mulberry32(7));
    expect(puzzle.ruleId).toBe('erased-sequence');
    expect(puzzle.wallSequence).toEqual([1, 2, null, 4]);
    expect(puzzle.erasedCount).toBe(3);
    expect(puzzle).not.toHaveProperty('clues');
  });

  it('同一種子生成同一組牆面與門面筆跡種子', () => {
    const a = createPinPuzzle(1, TRUE, mulberry32(1337));
    const b = createPinPuzzle(1, TRUE, mulberry32(1337));
    expect(a).toEqual(b);
  });

  it('拒絕重複、遺漏或越界的撞針配置', () => {
    expect(() => createPinPuzzle(1, [0, 1, 3], mulberry32(1))).toThrow(RangeError);
    expect(() => createPinPuzzle(4, [0, 1, 2], mulberry32(1))).toThrow(RangeError);
  });
});
