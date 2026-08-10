import { describe, expect, it } from 'vitest';
import {
  CIRCUIT_POOL, applyCircuitSolution, coldResetCircuit, emptyFuseSlot, fuseFaultDisposition,
  gatesFor, insertFuse,
  isCircuitSolved, newCircuit, seededCircuit, solutionFor, solveCircuit,
  toggleSwitch, traceCircuit,
} from '../src/logic/circuit';
import { mulberry32 } from '../src/logic/rng';

describe('雙線規則', () => {
  it.each(CIRCUIT_POOL.map(spec => [spec.id, spec] as const))(
    '%s：每一道閘門目標都能反推出唯一四開關答案',
    (_id, spec) => {
      const solution = solutionFor(spec);
      expect(solution.filter(Boolean)).toHaveLength(2);

      const board = newCircuit(spec, mulberry32(7));
      expect(insertFuse(board)).toBe(true);
      board.switches.splice(0, 4, ...solution);
      const trace = traceCircuit(board);
      expect(trace.outcome).toBe('solved');
      expect(trace.passed).toEqual([0, 1, 2, 3]);
      expect(trace.fault).toBeNull();
    },
  );

  it.each(CIRCUIT_POOL.map(spec => [spec.id, spec] as const))(
    '%s：16 種狀態中只有一種能通過全部閘門',
    (_id, spec) => {
      const board = newCircuit(spec, mulberry32(11));
      insertFuse(board);
      let wins = 0;
      for (let state = 0; state < 16; state++) {
        for (let i = 0; i < 4; i++) board.switches[i] = ((state >> i) & 1) as 0 | 1;
        if (traceCircuit(board).outcome === 'solved') wins++;
      }
      expect(wins).toBe(1);
    },
  );

  it('閘門顏色直接表達紅線應在上排或下排', () => {
    const gates = gatesFor(CIRCUIT_POOL[0]!);
    expect(gates[0]).toEqual({ top: 'blue', bottom: 'red' });
    expect(gates[2]).toEqual({ top: 'red', bottom: 'blue' });
  });
});

describe('開局、公平性與診斷', () => {
  it.each(CIRCUIT_POOL.map(spec => [spec.id, spec] as const))(
    '%s：保險絲插入後固定距離答案三步，全部各點一次仍不會過',
    (_id, spec) => {
      for (let seed = 1; seed <= 24; seed++) {
        const board = newCircuit(spec, mulberry32(seed));
        expect(solveCircuit(board)).toBeNull();
        expect(insertFuse(board)).toBe(true);
        expect(solveCircuit(board)?.cost).toBe(3);
        board.switches.forEach((_state, index) => expect(toggleSwitch(board, index)).toBe(true));
        expect(solveCircuit(board)?.cost).toBe(1);
        expect(isCircuitSolved(board)).toBe(false);
      }
    },
  );

  it('免費第一次診斷一定停在 A 閘門，先教玩家故障定位', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const board = seededCircuit(seed);
      insertFuse(board);
      const trace = traceCircuit(board);
      expect(trace.outcome).toBe('fault');
      expect(trace.fault).toBe(0);
      expect(trace.stages).toHaveLength(1);
    }
  });

  it('修正目前故障節點後，診斷只推進到下一個錯誤，不洩漏後段答案', () => {
    const board = seededCircuit(31);
    insertFuse(board);
    const first = traceCircuit(board);
    expect(first.fault).toBe(0);
    toggleSwitch(board, 0);
    const second = traceCircuit(board);
    expect(second.passed).toContain(0);
    expect(second.fault === null || second.fault > 0).toBe(true);
  });

  it('保險絲沒裝時不可操作，也不會形成測試結果', () => {
    const board = seededCircuit(8);
    const before = [...board.switches];
    expect(emptyFuseSlot(board)).toBe(0);
    expect(toggleSwitch(board, 0)).toBe(false);
    expect(board.switches).toEqual(before);
    expect(traceCircuit(board).outcome).toBe('missing');
    expect(insertFuse(board)).toBe(true);
    expect(emptyFuseSlot(board)).toBeNull();
    expect(insertFuse(board)).toBe(false);
  });

  it('開發用套解只在保險絲裝好後生效', () => {
    const board = seededCircuit(99);
    expect(applyCircuitSolution(board)).toBe(false);
    insertFuse(board);
    expect(applyCircuitSolution(board)).toBe(true);
    expect(solveCircuit(board)?.cost).toBe(0);
  });

  it('熔斷只重置操作進度，不更換題目、閘門或答案', () => {
    const board = seededCircuit(31);
    const opening = [...board.switches];
    const gates = board.gates.map(gate => ({ ...gate }));
    const solution = [...board.solution];
    const id = board.id;
    insertFuse(board);
    toggleSwitch(board, 0);
    toggleSwitch(board, 1);
    const learnedFault = traceCircuit(board).fault;

    expect(coldResetCircuit(board)).toBe(true);
    expect(board.fuseInstalled).toBe(false);
    expect(board.switches).toEqual(opening);
    expect(board.id).toBe(id);
    expect(board.gates).toEqual(gates);
    expect(board.solution).toEqual(solution);
    expect(learnedFault).not.toBeNull();
    expect(coldResetCircuit(board)).toBe(false);

    expect(insertFuse(board)).toBe(true);
    expect(solveCircuit(board)?.cost).toBe(3);
  });

  it('免費診斷、第一根與備用保險絲各有唯一失敗結果', () => {
    expect(fuseFaultDisposition(true, 1)).toBe('free-diagnostic');
    expect(fuseFaultDisposition(false, 1)).toBe('burnout');
    expect(fuseFaultDisposition(false, 2)).toBe('fatal');
  });
});

describe('盤面可重現性', () => {
  it('同一種子產生相同盤面，不同種子涵蓋多個題型', () => {
    const signature = (seed: number) => {
      const board = seededCircuit(seed);
      return `${board.id}:${board.switches.join('')}:${board.solution.join('')}`;
    };
    expect(signature(1234)).toBe(signature(1234));
    expect(new Set(Array.from({ length: 40 }, (_v, i) => signature(i + 1))).size).toBeGreaterThan(4);
  });
});
