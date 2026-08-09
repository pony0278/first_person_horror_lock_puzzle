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
export type RotatableKind = PipeKind | 'diverter';
/** `burnt` 燒毀（不可轉、不導電）；`empty` 缺件槽（零件還在環境裡）。 */
export type CellKind = RotatableKind | 'burnt' | 'empty';

/** 各管型每一個狀態對應的遮罩。索引 = rot。 */
const MASKS: Record<CellKind, readonly number[]> = {
  straight: [E | W, N | S],
  elbow: [N | E, E | S, S | W, W | N],
  diverter: [E | W, S | W],
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
   L=N|E  F=E|S  7=S|W  J=W|N  -=E|W  |=N|S  d=分流向東  D=分流向南  X=燒毀 */
const CHARS: Readonly<Record<string, { kind: CellKind; rot: number }>> = {
  '-': { kind: 'straight', rot: 0 },
  '|': { kind: 'straight', rot: 1 },
  L: { kind: 'elbow', rot: 0 },
  F: { kind: 'elbow', rot: 1 },
  '7': { kind: 'elbow', rot: 2 },
  J: { kind: 'elbow', rot: 3 },
  d: { kind: 'diverter', rot: 0 },
  D: { kind: 'diverter', rot: 1 },
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

export interface Board {
  readonly rows: number;
  readonly cols: number;
  readonly cells: Cell[];
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

export function chain(b: Board): number[] {
  return [...traceRoute(b).path];
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

export function isSolved(b: Board): boolean {
  return traceRoute(b).outcome === 'solved';
}
/** 轉一格。燒毀與空槽轉不動，回傳有沒有真的轉。 */
export function rotate(b: Board, i: number): boolean {
  const cell = at(b, i);
  if (cell.kind === 'burnt' || cell.kind === 'empty') return false;
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
  /** 每一排的**解答**佈局，字元見 CHARS。 */
  readonly rows: readonly string[];
  /** 開場就是空的那一格（零件在環境裡）。 */
  readonly slot: number;
  /** 解答路徑上要打亂幾格。路徑外的格子一律隨機轉，讓盤面看起來一樣亂。 */
  readonly scramble: number;
  /** 這張盤的性格，寫給人看的。 */
  readonly note: string;
}

/** 把 spec 讀成**已解開**的盤面。 */
export function parseSpec(spec: BoardSpec): Board {
  const cols = spec.rows[0]?.length ?? 0;
  const cells: Cell[] = [];
  for (const row of spec.rows) {
    if (row.length !== cols) throw new Error(`${spec.id}：各排長度不一致`);
    for (const ch of row) {
      const def = CHARS[ch];
      if (!def) throw new Error(`${spec.id}：看不懂的佈局字元 "${ch}"`);
      cells.push({ kind: def.kind, rot: def.rot, slot: null });
    }
  }
  return { rows: spec.rows.length, cols, cells };
}

/**
 * 開一局：挖掉缺件槽、打亂路徑上的幾格，路徑外的也一起亂轉。
 * 路徑外一起亂轉是刻意的 —— 只亂轉路徑上的格子，等於幫玩家把答案標出來。
 */
export function newBoard(spec: BoardSpec, rng: () => number = Math.random): Board {
  const b = parseSpec(spec);
  const solved = solve(b);
  if (!solved) throw new Error(`${spec.id}：解答佈局本身不通`);

  const slotCell = at(b, spec.slot);
  if (slotCell.kind !== 'straight' && slotCell.kind !== 'elbow') {
    throw new Error(`${spec.id}：缺件槽 ${spec.slot} 不是管子`);
  }
  const slotKind: PipeKind = slotCell.kind;

  const onPath = new Set(solved.path);
  const pick = solved.path.filter(i => i !== spec.slot);
  // Fisher-Yates 取前 scramble 個
  for (let k = pick.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    const a = pick[k]!, c = pick[j]!;
    pick[k] = c; pick[j] = a;
  }
  for (const i of pick.slice(0, spec.scramble)) {
    const p = periodOf(at(b, i).kind);
    at(b, i).rot = (at(b, i).rot + 1 + Math.floor(rng() * (p - 1))) % p;   // 必定轉歪
  }
  for (let i = 0; i < b.cells.length; i++) {
    const cell = at(b, i);
    if (onPath.has(i) || cell.kind === 'burnt') continue;
    cell.rot = Math.floor(rng() * periodOf(cell.kind));
  }

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

/**
 * 把取回來的零件裝上去。**一定是歪的** —— 落進槽裡還得再轉一下才通。
 * 那一下就是「動手把東西拼回去」的收尾（v3 §4）。
 */
export function insertPiece(b: Board, rng: () => number = Math.random): boolean {
  const i = emptySlot(b);
  if (i === null) return false;
  const cell = at(b, i);
  const kind = cell.slot;
  if (!kind) return false;

  cell.kind = kind;
  cell.rot = 0;
  const p = periodOf(kind);
  const s = solve(b);
  const k = s ? s.path.indexOf(i) : -1;
  const want = k >= 0 ? (s?.rots[k] ?? 0) : 0;
  cell.rot = (want + 1 + Math.floor(rng() * (p - 1))) % p;   // 避開正確轉向
  return true;
}

/**
 * 盤面池（§11：每局抽一張）。缺件一律在第一個分流之前的共用入口（slot=1），
 * 因此取件仍是強制的，卻不會用空槽位置洩漏安全路線。
 *
 * `d`＝刀閘往東、`D`＝刀閘往南。三張盤依序提供：
 * 一次二選一、兩次選擇含斷路／短路、以及安全方向反轉。
 */
export const POOL: readonly BoardSpec[] = [
  {
    id: 'A-下路安全',
    rows: ['--D--X--', 'X-L-----'],
    slot: 1,
    scramble: 4,
    note: '第一個刀閘往下才通門；直走會撞上焦黑短路端點',
  },
  {
    id: 'B-中路安全',
    rows: ['--d--DX-', 'X-L-|L--'],
    slot: 1,
    scramble: 5,
    note: '早轉向是普通斷路、晚直走會短路，只有第二個刀閘往下能通門',
  },
  {
    id: 'C-上路安全',
    rows: ['--d----7', 'X-L--X-L'],
    slot: 1,
    scramble: 5,
    note: '保持上路才能在末端下切；提早往下會撞上短路端點',
  },
];
/** 抽一張盤面（§11：只抽不生成）。 */
export function pickSpec(rng: () => number = Math.random): BoardSpec {
  const s = POOL[Math.floor(rng() * POOL.length)];
  if (!s) throw new Error('盤面池是空的');
  return s;
}

/** 固定種子開一局，測試與 F4 每日挑戰用（§11）。 */
export function seededBoard(seed: number): Board {
  const rng = mulberry32(seed);
  return newBoard(pickSpec(rng), rng);
}
