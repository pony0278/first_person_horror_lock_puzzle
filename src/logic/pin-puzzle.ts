/**
 * 門 1 的規則推理層。
 *
 * 撬鎖狀態機仍決定真針順序與假針；這個模組只把那組答案翻譯成牆上的
 * 「前人筆記」：兩個合法例證，加上四個沿撬鎖順序排列的線索，其中恰好
 * 一個違反共同規則。玩家找出並跳過它，剩下的順序就是原本的 trueOrder。
 */
import type { PinIndex } from './pins';

export type PinPuzzleRuleId = 'merge' | 'gap' | 'pair';

export interface PinPuzzleFormula {
  readonly terms: readonly number[];
  readonly result: number;
  readonly expected: number;
}

export interface PinPuzzleClue extends PinPuzzleFormula {
  readonly pin: PinIndex;
}

export interface PinPuzzle {
  readonly ruleId: PinPuzzleRuleId;
  readonly falsePin: PinIndex;
  readonly examples: readonly PinPuzzleFormula[];
  /** 牆面由左到右的線索；移除違規列後必須等於 trueOrder。 */
  readonly clues: readonly PinPuzzleClue[];
  /** Rough.js 的固定種子；同一局的筆跡不會每幀亂跳。 */
  readonly wallSeed: number;
}

interface RuleTemplate {
  readonly id: PinPuzzleRuleId;
  readonly makeTerms: (rng: () => number) => readonly number[];
  readonly evaluate: (terms: readonly number[]) => number;
}

const int = (rng: () => number, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));

const RULES: readonly RuleTemplate[] = [
  {
    id: 'merge',
    makeTerms: rng => [int(rng, 1, 6), int(rng, 1, 6)],
    evaluate: terms => terms[0]! + terms[1]!,
  },
  {
    id: 'gap',
    makeTerms: rng => {
      const high = int(rng, 4, 9);
      return [high, int(rng, 1, high - 1)];
    },
    evaluate: terms => Math.abs(terms[0]! - terms[1]!),
  },
  {
    id: 'pair',
    makeTerms: rng => [int(rng, 2, 5), int(rng, 2, 5)],
    evaluate: terms => terms[0]! * terms[1]!,
  },
];

function template(ruleId: PinPuzzleRuleId): RuleTemplate {
  const found = RULES.find(rule => rule.id === ruleId);
  if (!found) throw new RangeError(`未知的門 1 推理規則：${ruleId}`);
  return found;
}

export function evaluatePinRule(ruleId: PinPuzzleRuleId, terms: readonly number[]): number {
  return template(ruleId).evaluate(terms);
}

export function rowMatchesPinRule(ruleId: PinPuzzleRuleId,
                                  row: Pick<PinPuzzleFormula, 'terms' | 'result'>): boolean {
  return evaluatePinRule(ruleId, row.terms) === row.result;
}

function uniqueFormula(rule: RuleTemplate, rng: () => number, seen: Set<string>): PinPuzzleFormula {
  for (let tries = 0; tries < 100; tries++) {
    const terms = rule.makeTerms(rng);
    const expected = rule.evaluate(terms);
    const key = `${terms.join(',')}:${expected}`;
    if (seen.has(key)) continue;
    seen.add(key);
    return { terms, result: expected, expected };
  }
  throw new Error(`無法替規則 ${rule.id} 產生不重複題列`);
}

function wrongResult(expected: number, rng: () => number): number {
  const offsets = [-2, -1, 1, 2];
  for (let tries = 0; tries < offsets.length; tries++) {
    const delta = offsets[Math.floor(rng() * offsets.length)]!;
    if (expected + delta > 0) return expected + delta;
  }
  return expected + 1;
}

/**
 * 建立一局牆面線索。
 * difficulty 0 只用合併；1 加入差值；2 以上再加入成對相乘。
 */
export function createPinPuzzle(falsePin: PinIndex, trueOrder: readonly PinIndex[],
                                rng: () => number = Math.random, difficulty = 0): PinPuzzle {
  const pinCount = trueOrder.length + 1;
  const all = [...trueOrder, falsePin].sort((a, b) => a - b);
  const expectedPins = [...Array(pinCount).keys()];
  if (!Number.isInteger(falsePin) || falsePin < 0 ||
      all.length !== new Set(all).size || all.some((pin, i) => pin !== expectedPins[i])) {
    throw new RangeError('假針與真針順序必須恰好涵蓋所有撞針，且不得重複');
  }

  const maxRule = Math.max(0, Math.min(RULES.length - 1, Math.floor(difficulty)));
  const rule = RULES[Math.floor(rng() * (maxRule + 1))]!;
  const displayOrder = [...trueOrder];
  displayOrder.splice(int(rng, 0, trueOrder.length), 0, falsePin);

  const seen = new Set<string>();
  const examples = [uniqueFormula(rule, rng, seen), uniqueFormula(rule, rng, seen)];
  const clues = displayOrder.map(pin => {
    const row = uniqueFormula(rule, rng, seen);
    return {
      ...row,
      pin,
      result: pin === falsePin ? wrongResult(row.expected, rng) : row.expected,
    };
  });

  return {
    ruleId: rule.id,
    falsePin,
    examples,
    clues,
    wallSeed: Math.floor(rng() * 0x7fffffff),
  };
}

/** 驗收與 debug 共用：回傳牆面目前實際違規的撞針。 */
export function invalidPuzzlePins(puzzle: PinPuzzle): PinIndex[] {
  return puzzle.clues
    .filter(row => !rowMatchesPinRule(puzzle.ruleId, row))
    .map(row => row.pin);
}