import { describe, expect, it } from 'vitest';
import {
  createPinPuzzle, inferPinOrder, markPosition, missingPuzzlePins,
} from '../src/logic/pin-puzzle';
import { mulberry32 } from '../src/logic/rng';

const TRUE = [2, 0, 3] as const;

describe('門 1 缺格位置序列', () => {
  it('牆面固定為兩個軌道端點與一個明確的中央空缺', () => {
    const seenSteps = new Set<number>();
    for (let seed = 0; seed < 500; seed++) {
      const puzzle = createPinPuzzle(1, TRUE, mulberry32(seed));
      seenSteps.add(puzzle.step);
      expect(puzzle.clues).toHaveLength(3);
      expect(puzzle.missingIndex).toBe(1);
      expect(puzzle.clues.map(clue => clue.missing)).toEqual([false, true, false]);
      expect(puzzle.clues[1]).toEqual({ pin: null, mark: null, missing: true });
      expect([puzzle.clues[0].mark, puzzle.clues[2].mark].sort()).toEqual(['left', 'right']);
    }
    expect([...seenSteps].sort((a, b) => a - b)).toEqual([-2, 2]);
  });

  it('四根撞針是左、中、右三個真位置與一個偏心干擾位置', () => {
    const seenDistractors = new Set<string>();
    for (let seed = 0; seed < 500; seed++) {
      const falsePin = seed % 4;
      const order = [0, 1, 2, 3].filter(pin => pin !== falsePin);
      const puzzle = createPinPuzzle(falsePin, order, mulberry32(seed));
      const distractor = puzzle.pinMarks[falsePin]!;
      seenDistractors.add(distractor);
      expect(['near-left', 'near-right']).toContain(distractor);
      expect(puzzle.pinMarks[order[1]!]).toBe('center');
      expect(puzzle.pinMarks.filter(mark => ['left', 'center', 'right'].includes(mark))).toHaveLength(3);
      expect(new Set(puzzle.pinMarks).size).toBe(4);
    }
    expect([...seenDistractors].sort()).toEqual(['near-left', 'near-right']);
  });

  it('只有正中央撞針能補成等距位置序列', () => {
    for (let seed = 0; seed < 500; seed++) {
      const falsePin = seed % 4;
      const order = [3, 1, 0, 2].filter(pin => pin !== falsePin);
      const puzzle = createPinPuzzle(falsePin, order, mulberry32(seed));
      const visiblePositions = [puzzle.clues[0].mark!, puzzle.clues[2].mark!].map(markPosition);
      expect(visiblePositions).toEqual(puzzle.step === 2 ? [-2, 2] : [2, -2]);
      expect(missingPuzzlePins(puzzle)).toEqual([order[1]]);
      expect(markPosition(puzzle.pinMarks[order[1]!]!)).toBe(0);
    }
  });

  it('補回中央位置後的牆面順序就是原 trueOrder', () => {
    for (let seed = 0; seed < 500; seed++) {
      const falsePin = seed % 4;
      const order = [3, 1, 0, 2].filter(pin => pin !== falsePin);
      const puzzle = createPinPuzzle(falsePin, order, mulberry32(seed));
      expect(inferPinOrder(puzzle)).toEqual(order);
    }
  });

  it('不再含多邊形邊數資料，且無唯一缺格答案時拒絕推演', () => {
    const puzzle = createPinPuzzle(1, TRUE, mulberry32(7));
    expect(puzzle.ruleId).toBe('missing-position-sequence');
    expect(puzzle).not.toHaveProperty('pinShapes');
    expect(puzzle.clues.every(clue => !Object.hasOwn(clue, 'shape'))).toBe(true);
    const ambiguous = { ...puzzle, pinMarks: puzzle.pinMarks.map((mark, pin) =>
      pin === puzzle.falsePin ? 'center' as const : mark) };
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