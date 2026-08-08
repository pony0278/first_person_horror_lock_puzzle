import { describe, expect, it } from 'vitest';
import { createPinPuzzle, invalidPuzzlePins, rowMatchesPinRule } from '../src/logic/pin-puzzle';
import { mulberry32 } from '../src/logic/rng';

const TRUE = [2, 0, 3] as const;

describe('門 1 規則推理題', () => {
  it('兩個牆面例證都遵守本局規則', () => {
    for (let seed = 0; seed < 200; seed++) {
      const puzzle = createPinPuzzle(1, TRUE, mulberry32(seed), 2);
      expect(puzzle.examples.every(row => rowMatchesPinRule(puzzle.ruleId, row))).toBe(true);
    }
  });

  it('四條線索恰好一條違規，而且就是鎖內假針', () => {
    for (let seed = 0; seed < 500; seed++) {
      const falsePin = seed % 4;
      const order = [0, 1, 2, 3].filter(pin => pin !== falsePin);
      const puzzle = createPinPuzzle(falsePin, order, mulberry32(seed), 2);
      expect(invalidPuzzlePins(puzzle)).toEqual([falsePin]);
    }
  });

  it('從左到右跳過違規線索，得到的仍是原本撬鎖順序', () => {
    for (let seed = 0; seed < 200; seed++) {
      const puzzle = createPinPuzzle(1, TRUE, mulberry32(seed), 2);
      const inferred = puzzle.clues
        .filter(row => rowMatchesPinRule(puzzle.ruleId, row))
        .map(row => row.pin);
      expect(inferred).toEqual(TRUE);
    }
  });

  it('同一種子生成同一題與同一組 Rough.js 筆跡種子', () => {
    const a = createPinPuzzle(1, TRUE, mulberry32(1337), 2);
    const b = createPinPuzzle(1, TRUE, mulberry32(1337), 2);
    expect(a).toEqual(b);
  });

  it('難度 0 只出合併，後續難度逐步開放規則池', () => {
    for (let seed = 0; seed < 100; seed++) {
      expect(createPinPuzzle(1, TRUE, mulberry32(seed), 0).ruleId).toBe('merge');
      expect(['merge', 'gap']).toContain(createPinPuzzle(1, TRUE, mulberry32(seed), 1).ruleId);
      expect(['merge', 'gap', 'pair']).toContain(createPinPuzzle(1, TRUE, mulberry32(seed), 2).ruleId);
    }
  });

  it('拒絕重複、遺漏或越界的撞針配置', () => {
    expect(() => createPinPuzzle(1, [0, 1, 3], mulberry32(1))).toThrow(RangeError);
    expect(() => createPinPuzzle(4, [0, 1, 2], mulberry32(1))).toThrow(RangeError);
  });
});