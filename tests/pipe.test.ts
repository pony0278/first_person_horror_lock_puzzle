import { describe, expect, it } from 'vitest';
import {
  E, N, POOL, S, W,
  applyPhaseSolution, canRotate, charOf, emptySlot, insertPiece, isPhaseSolved,
  maskOf, newBoard, parseSpec, periodOf, rotate, rotMask,
  seededBoard, sinkOf, solvePhase, tracePhase,
} from '../src/logic/pipe';
import type { Board, BoardSpec, CircuitPhase } from '../src/logic/pipe';
import { mulberry32 } from '../src/logic/rng';

const layout = (b: Board): string[] => {
  const out: string[] = [];
  for (let row = 0; row < b.rows; row++) {
    out.push(b.cells.slice(row * b.cols, (row + 1) * b.cols).map(charOf).join(''));
  }
  return out;
};

function countOutcome(b: Board, phase: CircuitPhase, outcome: string): number {
  const before = b.controls.map(i => b.cells[i]!.rot);
  let count = 0;
  for (let state = 0; state < 2 ** b.controls.length; state++) {
    b.controls.forEach((i, bit) => { b.cells[i]!.rot = (state >> bit) & 1; });
    if (tracePhase(b, phase).outcome === outcome) count++;
  }
  b.controls.forEach((i, bit) => { b.cells[i]!.rot = before[bit]!; });
  return count;
}

describe('遮罩、管型與操作權', () => {
  it('遮罩順時針轉四次回到原點', () => {
    for (const mask of [N | E, E | W, S | W, N | S]) {
      expect(rotMask(rotMask(rotMask(rotMask(mask))))).toBe(mask);
    }
  });

  it('普通管與兩種機械選擇器的週期正確', () => {
    expect(periodOf('straight')).toBe(2);
    expect(periodOf('elbow')).toBe(4);
    expect(periodOf('diverter')).toBe(2);
    expect(periodOf('riser')).toBe(2);
  });

  it('分流器與回流選擇器各只有兩個接法', () => {
    const b = parseSpec({
      id: 'selector-shapes', rows: ['dU', '--'], slot: 3, scramble: 0,
      controls: [0, 1], note: '',
    });
    expect(maskOf(b.cells[0]!)).toBe(E | W);
    expect(maskOf(b.cells[1]!)).toBe(N | E);
    expect(rotate(b, 0)).toBe(true);
    expect(rotate(b, 1)).toBe(true);
    expect(maskOf(b.cells[0]!)).toBe(S | W);
    expect(maskOf(b.cells[1]!)).toBe(E | W);
  });

  it.each(POOL.map(spec => [spec.id, spec] as const))(
    '%s：只有列出的四個黃銅選擇器能轉',
    (_id, spec) => {
      const b = parseSpec(spec as BoardSpec);
      expect(b.controls).toHaveLength(4);
      expect(b.controls.every(i => canRotate(b, i))).toBe(true);
      const fixed = b.cells.findIndex((_cell, i) => !b.controls.includes(i));
      const before = b.cells[fixed]!.rot;
      expect(canRotate(b, fixed)).toBe(false);
      expect(rotate(b, fixed)).toBe(false);
      expect(b.cells[fixed]!.rot).toBe(before);
    },
  );
});

describe('兩階段盤面池', () => {
  it.each(POOL.map(spec => [spec.id, spec] as const))(
    '%s：先從指定方向替蓄電器充電，再經保險絲抵達門閂',
    (_id, spec) => {
      const b = parseSpec(spec as BoardSpec);
      expect(applyPhaseSolution(b, 'charge')).toBe(true);
      const charged = tracePhase(b, 'charge');
      expect(charged.outcome).toBe('charged');
      expect(charged.path.at(-1)).toBe(b.capacitor);

      expect(solvePhase(b, 'unlock')?.cost).toBe(2);
      expect(applyPhaseSolution(b, 'unlock')).toBe(true);
      const unlocked = tracePhase(b, 'unlock');
      expect(unlocked.outcome).toBe('solved');
      expect(unlocked.path).toContain(b.fuse);
      expect(unlocked.path.at(-1)).toBe(sinkOf(b));
    },
  );

  it.each(POOL.map(spec => [spec.id, spec] as const))(
    '%s：裝回零件後，開局距離充電解固定三步',
    (_id, spec) => {
      for (let seed = 1; seed <= 40; seed++) {
        const b = newBoard(spec as BoardSpec, mulberry32(seed));
        expect(solvePhase(b, 'charge')).toBeNull();
        expect(insertPiece(b, mulberry32(seed * 17))).toBe(true);
        expect(solvePhase(b, 'charge')?.cost).toBe(3);
        expect(isPhaseSolved(b, 'charge')).toBe(false);
      }
    },
  );

  it.each(POOL.map(spec => [spec.id, spec] as const))(
    '%s：四個選擇器全部各亂點一次仍不會通',
    (_id, spec) => {
      for (let seed = 1; seed <= 20; seed++) {
        const b = newBoard(spec as BoardSpec, mulberry32(seed));
        insertPiece(b);
        b.controls.forEach(i => expect(rotate(b, i)).toBe(true));
        expect(solvePhase(b, 'charge')?.cost).toBe(1);
        expect(isPhaseSolved(b, 'charge')).toBe(false);
      }
    },
  );

  it.each(POOL.map(spec => [spec.id, spec] as const))(
    '%s：四個控制狀態中只有一組能充電',
    (_id, spec) => {
      const b = newBoard(spec as BoardSpec, mulberry32(9));
      insertPiece(b);
      expect(countOutcome(b, 'charge', 'charged')).toBe(1);
      expect(b.controls.every(i => solvePhase(b, 'charge')!.path.includes(i))).toBe(true);
    },
  );

  it.each(POOL.map(spec => [spec.id, spec] as const))(
    '%s：盲猜完整兩階段成功率不高於 1/64',
    (_id, spec) => {
      const b = parseSpec(spec as BoardSpec);
      const chargeWins = countOutcome(b, 'charge', 'charged');
      const unlockWins = countOutcome(b, 'unlock', 'solved');
      expect(chargeWins).toBe(1);
      expect(unlockWins).toBe(4);
      expect((chargeWins * unlockWins) / 256).toBeLessThanOrEqual(1 / 64);
    },
  );

  it.each(POOL.map(spec => [spec.id, spec] as const))(
    '%s：一開始直接照解鎖路線送電會觸發 bypass',
    (_id, spec) => {
      const b = parseSpec(spec as BoardSpec);
      expect(tracePhase(b, 'unlock').outcome).toBe('solved');
      expect(tracePhase(b, 'charge').outcome).toBe('bypass');
    },
  );

  it.each(POOL.map(spec => [spec.id, spec] as const))(
    '%s：充電完成後只需翻動兩個控制就能解鎖',
    (_id, spec) => {
      const b = newBoard(spec as BoardSpec, mulberry32(13));
      insertPiece(b);
      expect(applyPhaseSolution(b, 'charge')).toBe(true);
      expect(solvePhase(b, 'unlock')?.cost).toBe(2);
      expect(applyPhaseSolution(b, 'unlock')).toBe(true);
      expect(isPhaseSolved(b, 'unlock')).toBe(true);
    },
  );
});

describe('零件與失敗保護', () => {
  it.each(POOL.map(spec => [spec.id, spec] as const))(
    '%s：缺件時兩階段都沒有可提交解',
    (_id, spec) => {
      const b = newBoard(spec as BoardSpec, mulberry32(7));
      expect(emptySlot(b)).toBe(spec.slot);
      expect(solvePhase(b, 'charge')).toBeNull();
      expect(solvePhase(b, 'unlock')).toBeNull();
      expect(tracePhase(b, 'charge').outcome).not.toBe('charged');
    },
  );

  it.each(POOL.map(spec => [spec.id, spec] as const))(
    '%s：裝回零件會自動對正，不把難度藏在插入手勢',
    (_id, spec) => {
      const b = newBoard(spec as BoardSpec, mulberry32(11));
      expect(insertPiece(b, mulberry32(99))).toBe(true);
      const goal = b.goals.charge!;
      const k = goal.path.indexOf(spec.slot);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(b.cells[spec.slot]!.rot).toBe(goal.rots[k]);
      expect(solvePhase(b, 'charge')?.cost).toBe(3);
      expect(insertPiece(b)).toBe(false);
    },
  );

  it('充電佈局若偷換管型會在載入時拒絕', () => {
    expect(() => parseSpec({
      id: 'bad-kind',
      rows: ['--', '--'],
      chargeRows: ['-L', '--'],
      slot: 0, scramble: 0, capacitor: 3, chargeEntry: N, note: '',
    })).toThrow(/換了管型/);
  });
});

describe('抽盤與可重現性', () => {
  it('同一顆種子開出同一張盤', () => {
    expect(layout(seededBoard(1234))).toEqual(layout(seededBoard(1234)));
  });

  it('多顆種子會抽到不同盤或不同三格錯位', () => {
    const variants = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) variants.add(layout(seededBoard(seed)).join('/'));
    expect(variants.size).toBeGreaterThan(3);
  });
});
