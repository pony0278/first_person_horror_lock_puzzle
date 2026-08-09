/**
 * 門 2「通電管線」的盤面邏輯 —— 純邏輯，不碰 DOM、不碰 Three.js（設計文件 §13）。
 *
 * 模型：每一格是一段管子，用 4 位元遮罩記它往哪幾個方向接（N=1 E=2 S=4 W=8）。
 * 轉一次 = 遮罩整個轉 90°。直管只有 2 個接口且相對，彎管 2 個接口且相鄰 ——
 * 因為每一格恰好 2 個接口（或 0 個），**通電的部分永遠是一條單鏈，不會分岔**。
 * 前緣火花因此永遠唯一，這是「電流停在這裡」讀得出來的前提。
 *
 * 為什麼沒有事件發射器（不像 lock.ts）：這裡的狀態就是一個陣列，
 * 渲染層每幀重算 chain() 即可（16 格，成本可忽略）。狀態機的複雜度不在這一層，
 * 在「什麼時候伸手」——那是 game/ 的事。
 *
 * 真正路線選擇由機械分流器提供：它有三個實體端口，卻一次只閉合 W→E 或 W→S。
 * 因此 2×8 仍能有岔路決策，同時保留單一電流前緣。 */

import { mulberry32 } from './rng';

/* ═══ 方向與遮罩 ═══════════════════════════════════════════ */

export const N = 1 as const;
export const E = 2 as const;
export const S = 4 as const;
export const W = 8 as const;
export type Dir = typeof N | typeof E | typeof S | typeof W;

const DIRS: readonly Dir[] = [N, E, S, W];
const OPP = { [N]: S, [E]: W, [S]: N, [W]: E } as const;

/** 遮罩順時針轉 90°：N→E→S→W→N。 */
export const rotMask = (m: number): number => ((m << 1) | (m >> 3)) & 15;

/* ═══ 格子 ═════════════════════════════════════════════════ */

/** 可以被取下、再裝回缺槽的兩種普通管型。 */
export type PipeKind = 'straight' | 'elbow';
/** `diverter` 是 W→E／W→S 二選一的刀閘，放在上排形成真正路線選擇。 */
export type RotatableKind = PipeKind | 'diverter' | 'riser';
/** `burnt` 燒毀（不可轉、不導電）；`empty` 缺件槽（零件還在環境裡）。 */
export type CellKind = RotatableKind | 'burnt' | 'empty';

/** 各管型每一個狀態對應的遮罩。索引 = rot。 */
const MASKS: Record<CellKind, readonly number[]> = {
  straight: [E | W, N | S],
  elbow: [N | E, E | S, S | W, W | N],
  diverter: [E | W, S | W],
  riser: [E | W, N | E],
  burnt: [0],
  empty: [0],
};
/** 轉一圈要幾下（直管 2、彎管 4）。 */
export const periodOf = (kind: CellKind): number => MASKS[kind].length;

export interface Cell {
  kind: CellKind;
  rot: number;
  /** 這一格是不是「缺的那一格」。填回去之後仍保留，渲染層要據此標示。 */
  slot: PipeKind | null;
}

export const maskOf = (cell: Cell): number =>
  MASKS[cell.kind][cell.rot % periodOf(cell.kind)] ?? 0;

/* 佈局字元 —— 盤面池用它手寫，測試與除錯也用它讀回來。
   L=N|E  F=E|S  7=S|W  J=W|N  -=E|W  |=N|S  d=向東／D=向南
   u=向東／U=向北的回流選擇器，X=燒毀 */
const CHARS: Readonly<Record<string, { kind: CellKind; rot: number }>> = {
  '-': { kind: 'straight', rot: 0 },
  '|': { kind: 'straight', rot: 1 },
  L: { kind: 'elbow', rot: 0 },
  F: { kind: 'elbow', rot: 1 },
  '7': { kind: 'elbow', rot: 2 },
  J: { kind: 'elbow', rot: 3 },
  d: { kind: 'diverter', rot: 0 },
  D: { kind: 'diverter', rot: 1 },
  u: { kind: 'riser', rot: 0 },
  U: { kind: 'riser', rot: 1 },
  X: { kind: 'burnt', rot: 0 },
};
/** 把一格畫回字元（測試與除錯用）。 */
export function charOf(cell: Cell): string {
  if (cell.kind === 'empty') return '*';
  for (const [ch, v] of Object.entries(CHARS)) {
    if (v.kind === cell.kind && v.rot === cell.rot % periodOf(cell.kind)) return ch;
  }
  return '?';
}

/* ═══ 盤面 ═════════════════════════════════════════════════ */

export type CircuitPhase = 'charge' | 'unlock';

export interface Board {
  readonly rows: number;
  readonly cols: number;
  readonly cells: Cell[];
  /** 玩家真正能操作的四個機械選擇器。固定管線不接受亂轉。 */
  readonly controls: readonly number[];
  /** 充電模組、保險絲與電容指定的充電入口。一般測試盤可為 null。 */
  readonly capacitor: number | null;
  readonly fuse: number | null;
  readonly chargeEntry: Dir | null;
  /** 兩階段各自唯一的目標路徑；一般測試盤可沒有。 */
  readonly goals: Record<CircuitPhase, Solution | null>;
}

/** 電流從左上角的 W 邊進來。 */
export const SOURCE = 0;
/** 電磁閂在右下角，電流要從它的 E 邊出去。 */
export const sinkOf = (b: Board): number => b.rows * b.cols - 1;

const at = (b: Board, i: number): Cell => {
  const c = b.cells[i];
  if (!c) throw new RangeError(`格子 ${i} 不存在（盤面 ${b.rows}×${b.cols}）`);
  return c;
};

/** 從第 i 格往方向 d 走一格；走出盤面回 null。 */
function step(b: Board, i: number, d: Dir): number | null {
  const r = Math.floor(i / b.cols);
  const c = i % b.cols;
  if (d === N) return r > 0 ? i - b.cols : null;
  if (d === S) return r < b.rows - 1 ? i + b.cols : null;
  if (d === W) return c > 0 ? i - 1 : null;
  return c < b.cols - 1 ? i + 1 : null;
}

/* ═══ 通電 ═════════════════════════════════════════════════ */

/**
 * 從電源沿著接得上的接口一路走，回傳依序經過的格子。
 * 每格最多 2 個接口 —— 所以這是一條鏈，不是一棵樹（見檔頭）。
 */
export type RouteOutcome = 'open' | 'short' | 'solved';

export interface RouteTrace {
  readonly path: readonly number[];
  readonly outcome: RouteOutcome;
  /** 斷路停點或燒毀格；成功時為 null。 */
  readonly fault: number | null;
}

/**
 * 沿目前配置追蹤一次測試電流。分流器一次只選一條輸出，因此結果仍是單鏈。
 * `short` 只在下一格是可見的燒毀端點時成立；普通接錯一律是可恢復的 `open`。
 */
export function traceRoute(b: Board): RouteTrace {
  const out: number[] = [];
  if (!(maskOf(at(b, SOURCE)) & W)) return { path: out, outcome: 'open', fault: SOURCE };

  const sink = sinkOf(b);
  let i = SOURCE;
  let from: number = W;
  const seen = new Set<number>();
  for (;;) {
    if (seen.has(i)) return { path: out, outcome: 'open', fault: i };
    seen.add(i);
    out.push(i);

    const exit = maskOf(at(b, i)) & ~from & 15;
    if (!exit || !DIRS.includes(exit as Dir)) return { path: out, outcome: 'open', fault: i };
    const j = step(b, i, exit as Dir);
    if (j === null) {
      return i === sink && exit === E
        ? { path: out, outcome: 'solved', fault: null }
        : { path: out, outcome: 'open', fault: i };
    }
    const next = at(b, j);
    if (next.kind === 'burnt') return { path: out, outcome: 'short', fault: j };
    if (next.kind === 'empty' || !(maskOf(next) & OPP[exit as Dir])) {
      return { path: out, outcome: 'open', fault: j };
    }
    from = OPP[exit as Dir];
    i = j;
  }
}

export type CircuitOutcome = RouteOutcome | 'charged' | 'bypass';

export interface CircuitTrace {
  readonly path: readonly number[];
  readonly outcome: CircuitOutcome;
  readonly fault: number | null;
}

/** path[k] 是從哪個接口進入；用來區分「從上方替電容充電」與「橫向通過」。 */
function entryDir(b: Board, path: readonly number[], k: number): Dir | null {
  if (k <= 0) return W;
  const prev = path[k - 1];
  const cur = path[k];
  if (prev === undefined || cur === undefined) return null;
  if (cur === prev + b.cols) return N;
  if (cur === prev - b.cols) return S;
  if (cur === prev + 1) return W;
  if (cur === prev - 1) return E;
  return null;
}

/**
 * 充電階段只在電流從指定端口進入電容時成功；橫向偷渡到門鎖算 bypass。
 * 解鎖階段則必須真的抵達右下門閂，並且路徑上經過保險絲。
 */
export function tracePhase(b: Board, phase: CircuitPhase): CircuitTrace {
  const trace = traceRoute(b);
  if (phase === 'charge') {
    const k = b.capacitor === null ? -1 : trace.path.indexOf(b.capacitor);
    if (k >= 0 && entryDir(b, trace.path, k) === b.chargeEntry) {
      return { path: trace.path.slice(0, k + 1), outcome: 'charged', fault: null };
    }
    if (trace.outcome === 'solved' || k >= 0) {
      return { path: trace.path, outcome: 'bypass', fault: b.capacitor ?? sinkOf(b) };
    }
    return trace;
  }

  if (trace.outcome === 'solved' && (b.fuse === null || trace.path.includes(b.fuse))) return trace;
  if (trace.outcome === 'solved') {
    return { path: trace.path, outcome: 'bypass', fault: b.fuse ?? sinkOf(b) };
  }
  return trace;
}

export function chain(b: Board): number[] {
  return [...traceRoute(b).path];
}
export function phaseChain(b: Board, phase: CircuitPhase): number[] {
  return [...tracePhase(b, phase).path];
}
/** 哪些格子通電了。 */
export function energized(b: Board): boolean[] {
  const lit = b.cells.map(() => false);
  for (const i of chain(b)) lit[i] = true;
  return lit;
}

/** 電流爬到第幾欄（0~1）。門框導管的亮度與電流嘶聲的音高都讀這個值。 */
export function reach(b: Board): number {
  let maxCol = -1;
  for (const i of chain(b)) maxCol = Math.max(maxCol, i % b.cols);
  return (maxCol + 1) / b.cols;
}

export function phaseReach(b: Board, phase: CircuitPhase): number {
  let maxCol = -1;
  for (const i of phaseChain(b, phase)) maxCol = Math.max(maxCol, i % b.cols);
  return (maxCol + 1) / b.cols;
}

export function isSolved(b: Board): boolean {
  return traceRoute(b).outcome === 'solved';
}
export function isPhaseSolved(b: Board, phase: CircuitPhase): boolean {
  const outcome = tracePhase(b, phase).outcome;
  return phase === 'charge' ? outcome === 'charged' : outcome === 'solved';
}
export function canRotate(b: Board, i: number): boolean {
  const cell = at(b, i);
  return b.controls.includes(i) && cell.kind !== 'burnt' && cell.kind !== 'empty';
}
/** 轉一格。燒毀與空槽轉不動，回傳有沒有真的轉。 */
export function rotate(b: Board, i: number): boolean {
  if (!canRotate(b, i)) return false;
  const cell = at(b, i);
  cell.rot = (cell.rot + 1) % periodOf(cell.kind);
  return true;
}

/* ═══ 求解與驗證 ═══════════════════════════════════════════ */

export interface Solution {
  /** 依序經過的格子。 */
  readonly path: readonly number[];
  /** path 上每一格該轉到哪個 rot。 */
  readonly rots: readonly number[];
  /** 從目前狀態轉到解答要點幾下。 */
  readonly cost: number;
}

/** 讀取盤面池已驗證的階段解，並換算目前狀態還要切幾下。 */
export function solvePhase(b: Board, phase: CircuitPhase): Solution | null {
  if (emptySlot(b) !== null) return null;
  const goal = b.goals[phase];
  if (!goal) return null;
  let cost = 0;
  for (let k = 0; k < goal.path.length; k++) {
    const i = goal.path[k];
    const want = goal.rots[k];
    if (i === undefined || want === undefined) return null;
    const cell = at(b, i);
    if (cell.kind === 'burnt' || cell.kind === 'empty') return null;
    cost += (want - cell.rot + periodOf(cell.kind)) % periodOf(cell.kind);
  }
  return { path: [...goal.path], rots: [...goal.rots], cost };
}

/** 一格要同時接上 a 與 b 這兩邊的話，該轉到哪個 rot；辦不到回 null。 */
function rotFor(kind: CellKind, a: Dir, b: Dir): number | null {
  const want = a | b;
  const ms = MASKS[kind];
  for (let r = 0; r < ms.length; r++) if (ms[r] === want) return r;
  return null;
}

/**
 * 只看管型（不看目前轉向）找出電源到電磁閂的路，回傳所需點擊數最少的那條。
 *
 * 注意 2 排盤面的結構事實：任何一條簡單路徑在欄上都是**單調往東**的 ——
 * 想往西繞，回頭時兩排在該欄都已經用掉，接不回來。所以垂直進入彎管時
 * 那個「往東或往西」的選擇，答案永遠是東。詳見 §19 的討論。
 */
export function solve(b: Board): Solution | null {
  const sink = sinkOf(b);
  let best: Solution | null = null;
  const path: number[] = [];
  const rots: number[] = [];
  const used = new Set<number>();

  const walk = (i: number, from: Dir, cost: number): void => {
    if (best && cost >= best.cost) return;             // 剪枝
    const cell = at(b, i);
    if (cell.kind === 'burnt' || cell.kind === 'empty') return;
    if (used.has(i)) return;

    used.add(i);
    path.push(i);
    for (const d of DIRS) {
      if (d === from) continue;
      const r = rotFor(cell.kind, from, d);
      if (r === null) continue;
      const add = (r - cell.rot + periodOf(cell.kind)) % periodOf(cell.kind);
      rots.push(r);

      const j = step(b, i, d);
      if (j === null) {
        // 走出盤面 —— 只有右下角往東才算解開
        if (i === sink && d === E && (!best || cost + add < best.cost)) {
          best = { path: [...path], rots: [...rots], cost: cost + add };
        }
      } else {
        walk(j, OPP[d], cost + add);
      }
      rots.pop();
    }
    path.pop();
    used.delete(i);
  };

  walk(SOURCE, W, 0);
  return best;
}

/**
 * 找出一條會撞上焦黑端點的可配置路線。它只供盤面池驗證與自動驗收使用；
 * 遊戲不會把這條路提示給玩家。
 */
export function solveShort(b: Board): Solution | null {
  let best: Solution | null = null;
  const path: number[] = [];
  const rots: number[] = [];
  const used = new Set<number>();

  const walk = (i: number, from: Dir, cost: number): void => {
    if (best && cost >= best.cost) return;
    const cell = at(b, i);
    if (cell.kind === 'burnt' || cell.kind === 'empty' || used.has(i)) return;

    used.add(i); path.push(i);
    for (const d of DIRS) {
      if (d === from) continue;
      const r = rotFor(cell.kind, from, d);
      if (r === null) continue;
      const add = (r - cell.rot + periodOf(cell.kind)) % periodOf(cell.kind);
      rots.push(r);
      const j = step(b, i, d);
      if (j !== null && at(b, j).kind === 'burnt') {
        if (!best || cost + add < best.cost) best = { path: [...path], rots: [...rots], cost: cost + add };
      } else if (j !== null) {
        walk(j, OPP[d], cost + add);
      }
      rots.pop();
    }
    path.pop(); used.delete(i);
  };

  walk(SOURCE, W, 0);
  return best;
}
export const solvable = (b: Board): boolean => solve(b) !== null;

/** 把解答套上去（測試與盤面池驗證用，不是遊戲流程）。 */
export function applySolution(b: Board, s: Solution): void {
  s.path.forEach((i, k) => { at(b, i).rot = s.rots[k] ?? 0; });
}
export function applyPhaseSolution(b: Board, phase: CircuitPhase): boolean {
  const solution = solvePhase(b, phase);
  if (!solution) return false;
  applySolution(b, solution);
  return isPhaseSolved(b, phase);
}

/**
 * 不在解答路徑上、也沒燒毀的格子所形成的連通區塊大小。
 *
 * 這些是「看起來也像路」的誘餌：玩家不先看清楚路形就急著轉，
 * 轉的就是這些格子 —— 代價是浪費的點擊與時間，不是死路。
 */
export function offPathRuns(b: Board): number[] {
  const s = solve(b);
  const onPath = new Set(s?.path ?? []);
  const seen = new Set<number>();
  const runs: number[] = [];

  for (let i = 0; i < b.cells.length; i++) {
    if (seen.has(i) || onPath.has(i) || at(b, i).kind === 'burnt') continue;
    let size = 0;
    const stack = [i];
    seen.add(i);
    while (stack.length) {
      const k = stack.pop();
      if (k === undefined) break;
      size++;
      for (const d of DIRS) {
        const j = step(b, k, d);
        if (j === null || seen.has(j) || onPath.has(j) || at(b, j).kind === 'burnt') continue;
        seen.add(j);
        stack.push(j);
      }
    }
    runs.push(size);
  }
  return runs;
}

/* ═══ 盤面池 ═══════════════════════════════════════════════ */

export interface BoardSpec {
  readonly id: string;
  /** 解鎖階段的驗證過佈局；字元見 CHARS。 */
  readonly rows: readonly string[];
  /** 充電階段的驗證過佈局。管型必須與 rows 完全相同，只能改轉向。 */
  readonly chargeRows?: readonly string[];
  /** 開場就是空的那一格（零件在環境裡）。 */
  readonly slot: number;
  /** 開局故意轉錯幾個充電路徑上的選擇器。 */
  readonly scramble: number;
  /** 玩家真正能操作的機械選擇器。 */
  readonly controls?: readonly number[];
  readonly capacitor?: number;
  readonly fuse?: number;
  readonly chargeEntry?: Dir;
  /** 這張盤的性格，寫給人看的。 */
  readonly note: string;
}

function readRows(id: string, rows: readonly string[]): {
  rows: number; cols: number; cells: Cell[];
} {
  const cols = rows[0]?.length ?? 0;
  const cells: Cell[] = [];
  for (const row of rows) {
    if (row.length !== cols) throw new Error(`${id}：各排長度不一致`);
    for (const ch of row) {
      const def = CHARS[ch];
      if (!def) throw new Error(`${id}：看不懂的佈局字元 "${ch}"`);
      cells.push({ kind: def.kind, rot: def.rot, slot: null });
    }
  }
  return { rows: rows.length, cols, cells };
}

const blankGoals = (): Record<CircuitPhase, Solution | null> => ({
  charge: null, unlock: null,
});

function boardFor(spec: BoardSpec, rows: readonly string[]): Board {
  const parsed = readRows(spec.id, rows);
  const controls = spec.controls ?? parsed.cells.flatMap((cell, i) =>
    cell.kind === 'burnt' || cell.kind === 'empty' ? [] : [i]);
  return {
    ...parsed,
    controls: [...controls],
    capacitor: spec.capacitor ?? null,
    fuse: spec.fuse ?? null,
    chargeEntry: spec.chargeEntry ?? null,
    goals: blankGoals(),
  };
}

function goalFrom(board: Board, phase: CircuitPhase): Solution | null {
  const trace = tracePhase(board, phase);
  const ok = phase === 'charge' ? trace.outcome === 'charged' : trace.outcome === 'solved';
  if (!ok) return null;
  return {
    path: [...trace.path],
    rots: trace.path.map(i => at(board, i).rot),
    cost: 0,
  };
}

/** 把 spec 讀成解鎖階段的已解盤面，並附上兩階段唯一目標。 */
export function parseSpec(spec: BoardSpec): Board {
  const board = boardFor(spec, spec.rows);
  const chargeBoard = boardFor(spec, spec.chargeRows ?? spec.rows);
  if (board.rows !== chargeBoard.rows || board.cols !== chargeBoard.cols) {
    throw new Error(`${spec.id}：充電與解鎖盤面尺寸不同`);
  }
  for (let i = 0; i < board.cells.length; i++) {
    if (board.cells[i]?.kind !== chargeBoard.cells[i]?.kind) {
      throw new Error(`${spec.id}：第 ${i} 格在兩階段換了管型`);
    }
  }
  board.goals.charge = spec.capacitor === undefined ? null : goalFrom(chargeBoard, 'charge');
  board.goals.unlock = goalFrom(board, 'unlock');
  if (spec.capacitor !== undefined && !board.goals.charge) {
    throw new Error(`${spec.id}：充電佈局沒有從指定端口抵達電容`);
  }
  if (spec.fuse !== undefined && !board.goals.unlock) {
    throw new Error(`${spec.id}：解鎖佈局沒有經過保險絲抵達門閂`);
  }
  return board;
}

/**
 * 開一局：先套用充電佈局，再故意把其中三個二態選擇器翻錯。
 * 恰留一個二態選擇器正確，玩家把四個全部亂點一次仍會留下另一個錯誤狀態。
 */
export function newBoard(spec: BoardSpec, rng: () => number = Math.random): Board {
  const b = parseSpec(spec);
  const chargeLayout = boardFor(spec, spec.chargeRows ?? spec.rows);
  b.cells.forEach((cell, i) => { cell.rot = chargeLayout.cells[i]?.rot ?? cell.rot; });

  const goal = b.goals.charge;
  if (goal) {
    const onChargePath = new Set(goal.path);
    const choices = b.controls.filter(i => i !== spec.slot && onChargePath.has(i));
    if (choices.length < spec.scramble) {
      throw new Error(`${spec.id}：充電路徑沒有足夠的可操作選擇器`);
    }
    for (let k = choices.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      const tmp = choices[k]!;
      choices[k] = choices[j]!;
      choices[j] = tmp;
    }
    for (const i of choices.slice(0, spec.scramble)) {
      const cell = at(b, i);
      if (periodOf(cell.kind) !== 2) throw new Error(`${spec.id}：選擇器 ${i} 不是二態`);
      cell.rot = (cell.rot + 1) % 2;
    }
  }

  const slotCell = at(b, spec.slot);
  if (slotCell.kind !== 'straight' && slotCell.kind !== 'elbow') {
    throw new Error(`${spec.id}：缺件槽 ${spec.slot} 不是管子`);
  }
  const slotKind: PipeKind = slotCell.kind;
  slotCell.kind = 'empty';
  slotCell.rot = 0;
  slotCell.slot = slotKind;
  return b;
}

/** 缺件槽的索引；沒有（已填回）回 null。 */
export function emptySlot(b: Board): number | null {
  const i = b.cells.findIndex(c => c.kind === 'empty');
  return i < 0 ? null : i;
}

/** 取回的零件直接吸附並對正；難度留給四個選擇器，不再藏在裝回手勢。 */
export function insertPiece(b: Board, _rng: () => number = Math.random): boolean {
  const i = emptySlot(b);
  if (i === null) return false;
  const cell = at(b, i);
  const kind = cell.slot;
  if (!kind) return false;

  cell.kind = kind;
  const chargeGoal = b.goals.charge;
  const k = chargeGoal?.path.indexOf(i) ?? -1;
  cell.rot = k >= 0 ? (chargeGoal?.rots[k] ?? 0) : 0;
  return true;
}

/**
 * 三張兩階段盤面：
 * - 四個選擇器中，充電解需要全部四個同時正確；
 * - 電容只接受上方充電，橫向通過不算；
 * - 充電後必須翻動早期下切與電容回流兩個選擇器，才能經保險絲開門。
 */
export const POOL: readonly BoardSpec[] = [
  {
    id: 'A-晚充早開',
    rows: ['--Dd-dXX', 'XXL--u--'],
    chargeRows: ['--dd-DXX', 'XXL--U--'],
    slot: 1, scramble: 3,
    controls: [2, 3, 5, 13],
    capacitor: 13, fuse: 12, chargeEntry: N,
    note: '先沿上排從晚端替電容充電，再從早端下切經保險絲開門',
  },
  {
    id: 'B-短充長開',
    rows: ['--DddXXX', 'XXL-u---'],
    chargeRows: ['--ddDXXX', 'XXL-U---'],
    slot: 1, scramble: 3,
    controls: [2, 3, 4, 12],
    capacitor: 12, fuse: 11, chargeEntry: N,
    note: '電容較早落在下排，解鎖路徑則繼續穿過整段底部母線',
  },
  {
    id: 'C-晚分流',
    rows: ['---DddXX', 'XXXL-u--'],
    chargeRows: ['---ddDXX', 'XXXL-U--'],
    slot: 1, scramble: 3,
    controls: [3, 4, 5, 13],
    capacitor: 13, fuse: 12, chargeEntry: N,
    note: '第一個分流延後一欄，不能沿用前兩張的肌肉記憶',
  },
];

/** 抽一張盤面（§11：只抽不生成）。 */
export function pickSpec(rng: () => number = Math.random): BoardSpec {
  const spec = POOL[Math.floor(rng() * POOL.length)];
  if (!spec) throw new Error('盤面池是空的');
  return spec;
}

/** 固定種子開一局，測試與 F4 每日挑戰用（§11）。 */
export function seededBoard(seed: number): Board {
  const rng = mulberry32(seed);
  return newBoard(pickSpec(rng), rng);
}
