import { describe, expect, it } from 'vitest';
import {
  E, N, POOL, S, W,
  chain, charOf, emptySlot, energized, insertPiece, isSolved, maskOf,
  newBoard, offPathRuns, parseSpec, periodOf, reach, rotMask, rotate,
  seededBoard, sinkOf, solve, solveShort, solvable, traceRoute,
} from '../src/logic/pipe';
import type { Board, BoardSpec } from '../src/logic/pipe';
import { mulberry32 } from '../src/logic/rng';

const layout = (b: Board): string[] => {
  const out: string[] = [];
  for (let r = 0; r < b.rows; r++) {
    out.push(b.cells.slice(r * b.cols, (r + 1) * b.cols).map(charOf).join(''));
  }
  return out;
};

describe('遮罩與轉向', () => {
  it('轉四次回到原點', () => {
    for (const m of [N | E, E | W, S | W, N | S]) {
      expect(rotMask(rotMask(rotMask(rotMask(m))))).toBe(m);
    }
  });

  it('直管轉兩次就回來，彎管要四次', () => {
    expect(periodOf('straight')).toBe(2);
    expect(periodOf('elbow')).toBe(4);
    expect(rotMask(rotMask(E | W))).toBe(E | W);
    expect(rotMask(rotMask(N | E))).not.toBe(N | E);
  });

  it('字元與轉向對得上', () => {
    const b = parseSpec({ id: 't', rows: ['LF7J', '-|-|'], slot: 0, scramble: 0, note: '' });
    expect(layout(b)).toEqual(['LF7J', '-|-|']);
    expect(maskOf(b.cells[0]!)).toBe(N | E);
    expect(maskOf(b.cells[4]!)).toBe(E | W);
    expect(maskOf(b.cells[5]!)).toBe(N | S);
  });

  it('分流器只有向東與向南兩種狀態，且同時仍只有兩個有效接口', () => {
    const b = parseSpec({ id: 't', rows: ['d-', '--'], slot: 1, scramble: 0, note: '' });
    expect(periodOf('diverter')).toBe(2);
    expect(maskOf(b.cells[0]!)).toBe(E | W);
    rotate(b, 0);
    expect(charOf(b.cells[0]!)).toBe('D');
    expect(maskOf(b.cells[0]!)).toBe(S | W);
  });
  it('燒毀格轉不動', () => {
    const b = parseSpec({ id: 't', rows: ['X-', '--'], slot: 1, scramble: 0, note: '' });
    expect(rotate(b, 0)).toBe(false);
    expect(maskOf(b.cells[0]!)).toBe(0);
  });

  it('轉滿一圈回到原狀', () => {
    const b = parseSpec({ id: 't', rows: ['L-', '--'], slot: 1, scramble: 0, note: '' });
    const before = charOf(b.cells[0]!);
    for (let i = 0; i < 4; i++) rotate(b, 0);
    expect(charOf(b.cells[0]!)).toBe(before);
  });
});

describe('通電', () => {
  it('電流是一條鏈，不會分岔', () => {
    // 每格最多兩個接口 —— 這是前緣火花唯一的前提
    for (const spec of POOL) {
      const b = parseSpec(spec);
      const lit = energized(b);
      expect(lit.filter(Boolean).length).toBe(chain(b).length);
      expect(new Set(chain(b)).size).toBe(chain(b).length);
    }
  });

  it('左上角沒有 W 接口就完全不通電', () => {
    const b = parseSpec({ id: 't', rows: ['|-', '--'], slot: 1, scramble: 0, note: '' });
    expect(chain(b)).toEqual([]);
    expect(reach(b)).toBe(0);
  });

  it('斷在中間時 reach 停在斷點那一欄', () => {
    const b = parseSpec({ id: 't', rows: ['--|-', '----'], slot: 1, scramble: 0, note: '' });
    expect(chain(b)).toEqual([0, 1]);
    expect(reach(b)).toBe(0.5);
  });

  it('動到已通的部分，光會退回去', () => {
    const b = parseSpec(POOL[0]!);
    const before = chain(b).length;
    rotate(b, 1);
    expect(chain(b).length).toBeLessThan(before);
  });
});

describe('盤面池', () => {
  it.each(POOL.map(s => [s.id, s] as const))('%s：手寫的佈局本身是解開的', (_id, spec) => {
    const b = parseSpec(spec as BoardSpec);
    expect(isSolved(b)).toBe(true);
    expect(chain(b)[chain(b).length - 1]).toBe(sinkOf(b));
  });

  it.each(POOL.map(s => [s.id, s] as const))('%s：分流狀態只有一組能抵達門鎖，且至少一組會短路', (_id, spec) => {
    const b = parseSpec(spec as BoardSpec);
    const diverters = b.cells.flatMap((cell, i) => cell.kind === 'diverter' ? [i] : []);
    expect(diverters.length).toBeGreaterThanOrEqual(1);
    let solved = 0, shorts = 0;
    for (let state = 0; state < 2 ** diverters.length; state++) {
      diverters.forEach((i, bit) => { b.cells[i]!.rot = (state >> bit) & 1; });
      const outcome = traceRoute(b).outcome;
      if (outcome === 'solved') solved++;
      if (outcome === 'short') shorts++;
    }
    expect(solved).toBe(1);
    expect(shorts).toBeGreaterThanOrEqual(1);
  });

  it.each(POOL.map(s => [s.id, s] as const))('%s：任意打亂後仍能配置出真的短路，不會先退化成普通斷路', (_id, spec) => {
    for (let seed = 1; seed <= 20; seed++) {
      const b = newBoard(spec as BoardSpec, mulberry32(seed));
      insertPiece(b, mulberry32(seed * 17));
      const short = solveShort(b);
      expect(short).not.toBeNull();
      short!.path.forEach((i, k) => { b.cells[i]!.rot = short!.rots[k]!; });
      expect(traceRoute(b).outcome).toBe('short');
    }
  });
  it.each(POOL.map(s => [s.id, s] as const))('%s：缺件位於第一個分流前的共用入口，不會洩漏安全路線', (_id, spec) => {
    const b = parseSpec(spec as BoardSpec);
    const firstDiverter = b.cells.findIndex(cell => cell.kind === 'diverter');
    expect((spec as BoardSpec).slot).toBeGreaterThan(0);
    expect((spec as BoardSpec).slot).toBeLessThan(firstDiverter);
    expect(solve(b)?.path).toContain((spec as BoardSpec).slot);
  });
  it.each(POOL.map(s => [s.id, s] as const))('%s：缺件槽在解答路徑上', (_id, spec) => {
    const b = parseSpec(spec as BoardSpec);
    expect(solve(b)?.path).toContain((spec as BoardSpec).slot);
  });

  it.each(POOL.map(s => [s.id, s] as const))('%s：沒有那一件就解不開', (_id, spec) => {
    // 這一條是整個門 2 的支點：取件必須是強制的，不能是可選的
    const b = newBoard(spec as BoardSpec, mulberry32(7));
    expect(emptySlot(b)).toBe((spec as BoardSpec).slot);
    expect(solvable(b)).toBe(false);
  });

  it.each(POOL.map(s => [s.id, s] as const))('%s：裝上零件後解得開', (_id, spec) => {
    const b = newBoard(spec as BoardSpec, mulberry32(7));
    expect(insertPiece(b, mulberry32(3))).toBe(true);
    expect(solvable(b)).toBe(true);
  });

  it.each(POOL.map(s => [s.id, s] as const))('%s：點擊成本落在時間預算內', (_id, spec) => {
    for (let seed = 1; seed <= 40; seed++) {
      const b = newBoard(spec as BoardSpec, mulberry32(seed));
      insertPiece(b, mulberry32(seed * 31));
      const cost = solve(b)?.cost;
      expect(cost).toBeDefined();
      // 20~25 秒內要點得完，又不能少到沒有解謎感
      expect(cost!).toBeGreaterThanOrEqual(3);
      expect(cost!).toBeLessThanOrEqual(14);
    }
  });

  it.each(POOL.map(s => [s.id, s] as const))('%s：有看起來也像路的誘餌區', (_id, spec) => {
    // 不先看清楚路形就急著轉，轉的就是這些格子（浪費點擊）
    const runs = offPathRuns(parseSpec(spec as BoardSpec));
    expect(Math.max(...runs, 0)).toBeGreaterThanOrEqual(2);
  });

  it.each(POOL.map(s => [s.id, s] as const))('%s：開局不會恰好已經解開', (_id, spec) => {
    for (let seed = 1; seed <= 40; seed++) {
      expect(isSolved(newBoard(spec as BoardSpec, mulberry32(seed)))).toBe(false);
    }
  });
});

describe('求解', () => {
  it('套上解答就通', () => {
    for (const spec of POOL) {
      const b = newBoard(spec, mulberry32(11));
      insertPiece(b, mulberry32(12));
      const s = solve(b);
      expect(s).not.toBeNull();
      s!.path.forEach((i, k) => { b.cells[i]!.rot = s!.rots[k]!; });
      expect(isSolved(b)).toBe(true);
    }
  });

  it('cost 就是實際要點的次數', () => {
    const b = newBoard(POOL[1]!, mulberry32(5));
    insertPiece(b, mulberry32(6));
    const cost = solve(b)!.cost;
    let taps = 0;
    while (!isSolved(b)) {
      const s = solve(b)!;
      const k = s.rots.findIndex((r, n) => b.cells[s.path[n]!]!.rot !== r);
      rotate(b, s.path[k]!);
      taps++;
      expect(taps).toBeLessThanOrEqual(cost);   // 不會愈點愈遠
    }
    expect(taps).toBe(cost);
  });

  it('普通接錯是斷路；選到焦黑端點才是短路', () => {
    const b = parseSpec(POOL[0]!);
    const diverter = b.cells.findIndex(cell => cell.kind === 'diverter');
    b.cells[diverter]!.rot = 0;
    expect(traceRoute(b).outcome).toBe('short');
    rotate(b, 0);
    expect(traceRoute(b).outcome).toBe('open');
  });
  it('燒毀格擋住唯一通路時無解', () => {
    const b = parseSpec({ id: 't', rows: ['---7', '--XL'], slot: 3, scramble: 0, note: '' });
    expect(solvable(b)).toBe(true);
    b.cells[7]!.kind = 'burnt';
    expect(solvable(b)).toBe(false);
  });

  it('2×N 格圖裡「角到角」的簡單路徑全部單調往東（窮舉證明）', () => {
    // 這不是在測 pipe.ts，是在證一件格圖的事實：2 排盤面放不下真正的岔路。
    // 往西繞的話，要回東邊就得換排，但兩排在那些欄都已經走過 —— 接不回來。
    // 這條窮舉解釋了為什麼普通直／彎管做不出岔路；現在的選擇由分流器改變格內連接。
    const COLS = 8, NCELL = 2 * COLS;
    const nbr = (i: number): number[] => {
      const r = Math.floor(i / COLS), c = i % COLS, out: number[] = [];
      if (r > 0) out.push(i - COLS);
      if (r < 1) out.push(i + COLS);
      if (c > 0) out.push(i - 1);
      if (c < COLS - 1) out.push(i + 1);
      return out;
    };
    let paths = 0;
    const seen = new Set<number>();
    const path: number[] = [];
    const walk = (i: number): void => {
      seen.add(i); path.push(i);
      if (i === NCELL - 1) {
        paths++;
        const cols = path.map(k => k % COLS);
        for (let k = 1; k < cols.length; k++) {
          expect(cols[k]!).toBeGreaterThanOrEqual(cols[k - 1]!);
        }
      } else {
        for (const j of nbr(i)) if (!seen.has(j)) walk(j);
      }
      path.pop(); seen.delete(i);
    };
    walk(0);
    expect(paths).toBeGreaterThan(50);   // 真的窮舉過，不是零條路徑空跑
  });

  it('解答路徑在欄上單調往東（2 排盤面的結構事實）', () => {
    // 想往西繞，回頭時兩排在該欄都已用掉 —— 所以垂直進入彎管時答案永遠是東。
    // 普通管仍遵守這條性質；真正選擇由分流器的刀閘狀態提供。
    for (const spec of POOL) {
      const cols = parseSpec(spec).cols;
      const path = solve(parseSpec(spec))!.path;
      const colsSeen = path.map(i => i % cols);
      for (let k = 1; k < colsSeen.length; k++) {
        expect(colsSeen[k]!).toBeGreaterThanOrEqual(colsSeen[k - 1]!);
      }
    }
  });
});

describe('取件', () => {
  it('落進槽裡一定是歪的', () => {
    for (const spec of POOL) {
      for (let seed = 1; seed <= 30; seed++) {
        const b = newBoard(spec, mulberry32(seed));
        insertPiece(b, mulberry32(seed * 17));
        expect(isSolved(b)).toBe(false);
        const s = solve(b)!;
        const k = s.path.indexOf(spec.slot);
        expect(b.cells[spec.slot]!.rot).not.toBe(s.rots[k]);   // 還得再轉一下
      }
    }
  });

  it('零件裝回去的管型與挖走的一致', () => {
    for (const spec of POOL) {
      const solved = parseSpec(spec);
      const want = solved.cells[spec.slot]!.kind;
      const b = newBoard(spec, mulberry32(9));
      insertPiece(b, mulberry32(9));
      expect(b.cells[spec.slot]!.kind).toBe(want);
      expect(b.cells[spec.slot]!.slot).toBe(want);   // 渲染層要據此標示「這是你拿回來的那一件」
    }
  });

  it('沒有空槽時裝不進去', () => {
    const b = parseSpec(POOL[0]!);
    expect(emptySlot(b)).toBeNull();
    expect(insertPiece(b)).toBe(false);
  });
});

describe('抽盤與重現', () => {
  it('同一顆種子開出同一張盤', () => {
    expect(layout(seededBoard(1234))).toEqual(layout(seededBoard(1234)));
    expect(layout(seededBoard(1234))).not.toEqual(layout(seededBoard(5678)));
  });

  it('打亂不會只挑路徑上的格子（否則等於標出答案）', () => {
    const spec = POOL[1]!;
    const solved = parseSpec(spec);
    const onPath = new Set(solve(solved)!.path);
    let offMoved = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const b = newBoard(spec, mulberry32(seed));
      for (let i = 0; i < b.cells.length; i++) {
        if (onPath.has(i) || b.cells[i]!.kind === 'burnt') continue;
        if (b.cells[i]!.rot !== solved.cells[i]!.rot) offMoved++;
      }
    }
    expect(offMoved).toBeGreaterThan(0);
  });
});
