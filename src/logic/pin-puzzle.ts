/** 門 1 的缺格圖形序列：牆面顯示三格，中間一格被拔走。
 * 玩家由三角形／五邊形推回四邊形，再依完整序列撬動三根真針。 */
import type { PinIndex } from './pins';

export type PinPuzzleRuleId = 'missing-shape-sequence';
export type PinPuzzleShape = 'circle' | 'triangle' | 'square' | 'pentagon';

export interface PinPuzzleClue {
  /** 空缺格不暴露對應撞針；玩家必須從門上的候選圖形推回來。 */
  readonly pin: PinIndex | null;
  readonly shape: PinPuzzleShape | null;
  readonly missing: boolean;
}

export interface PinPuzzle {
  readonly ruleId: PinPuzzleRuleId;
  readonly falsePin: PinIndex;
  /** 牆面由左到右；固定只有中間一格缺失。 */
  readonly clues: readonly [PinPuzzleClue, PinPuzzleClue, PinPuzzleClue];
  /** 以撞針索引查出門鎖上實際顯示的圖形。 */
  readonly pinShapes: readonly PinPuzzleShape[];
  readonly missingIndex: 1;
  /** 多邊形邊數每格的變化；正反向皆可能。 */
  readonly step: 1 | -1;
  readonly wallSeed: number;
}

export function shapeSides(shape: PinPuzzleShape): number {
  if (shape === 'circle') return 0;
  if (shape === 'triangle') return 3;
  if (shape === 'square') return 4;
  return 5;
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

  const step = rng() < 0.5 ? 1 : -1;
  const sequence: readonly PinPuzzleShape[] = step === 1
    ? ['triangle', 'square', 'pentagon']
    : ['pentagon', 'square', 'triangle'];
  const pinShapes: PinPuzzleShape[] = Array(pinCount).fill('circle');
  trueOrder.forEach((pin, index) => { pinShapes[pin] = sequence[index]!; });
  pinShapes[falsePin] = 'circle';

  return {
    ruleId: 'missing-shape-sequence',
    falsePin,
    clues: [
      { pin: trueOrder[0]!, shape: sequence[0]!, missing: false },
      { pin: null, shape: null, missing: true },
      { pin: trueOrder[2]!, shape: sequence[2]!, missing: false },
    ],
    pinShapes,
    missingIndex: 1,
    step,
    wallSeed: Math.floor(rng() * 0x7fffffff),
  };
}

export function missingPuzzlePins(puzzle: PinPuzzle): PinIndex[] {
  const missing = puzzle.clues.flatMap((clue, index) => clue.missing ? [index] : []);
  if (missing.length !== 1 || missing[0] !== puzzle.missingIndex) return [];
  const before = puzzle.clues[puzzle.missingIndex - 1]?.shape;
  const after = puzzle.clues[puzzle.missingIndex + 1]?.shape;
  if (!before || !after) return [];
  const expectedSides = (shapeSides(before) + shapeSides(after)) / 2;
  if (!Number.isInteger(expectedSides)) return [];
  const visiblePins = new Set(puzzle.clues.flatMap(clue => clue.pin === null ? [] : [clue.pin]));
  return puzzle.pinShapes.flatMap((shape, pin) =>
    !visiblePins.has(pin) && shapeSides(shape) === expectedSides ? [pin] : []);
}

export function inferPinOrder(puzzle: PinPuzzle): PinIndex[] {
  const missingPins = missingPuzzlePins(puzzle);
  if (missingPins.length !== 1) throw new Error('門 1 缺格圖形序列沒有唯一答案');
  return puzzle.clues.map(clue => clue.pin ?? missingPins[0]!);
}