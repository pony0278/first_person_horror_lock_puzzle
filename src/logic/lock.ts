/**
 * 撞針鎖的狀態機 —— 純邏輯，不碰 DOM、不碰 Three.js。
 *
 * 設計文件 §13 要求把遊戲邏輯與渲染層分離，讓邏輯層之後可以整包帶走。
 * 這個檔案就是那個「整包」，而且是 F1 唯一需要動的地方：
 * 三扇門、滑落針、雙生針、多假針、六針全都是這裡的規則變體（§7）。
 */

import type { PinIndex, PinRule, PinState, PushResult } from './pins';
import { mulberry32 } from './rng';

/** 狀態機發出的事件與各自的 payload。 */
export interface LockEvents {
  /** 對的針固定了 —— 鎖芯累進轉一格。 */
  set: { pin: PinIndex };
  /** 假針固定了 —— 下方看起來幾乎一樣，但鎖芯不動（§9）。 */
  falseSet: { pin: PinIndex };
  /** 推錯了 —— 頂到約 40% 就頂住。 */
  error: { pin: PinIndex };
  /** 連續錯 `severeAt` 次 —— 怪物瞬間前進一段距離（§6，不是提速）。 */
  severe: Record<string, never>;
  release: { pin: PinIndex; was: PinState };
  releaseAll: Record<string, never>;
  solved: Record<string, never>;
}

export type LockEvent = keyof LockEvents;
export type LockListener<E extends LockEvent> = (payload: LockEvents[E]) => void;

export interface LockOptions {
  pinCount?: number;
  falseCount?: number;
  /** 每固定一支真撞針，鎖芯轉動的角度。設計文件 §9：8~10°，做成 45° 等於直接標答案。 */
  degPerPin?: number;
  /** 連續錯幾次觸發 severe。 */
  severeAt?: number;
  /** 難度變體。F0 只支援 `basic`；其餘見 pins.ts 的說明。 */
  rules?: readonly PinRule[];
  /** 注入亂數以便測試；預設 `Math.random`。 */
  rng?: () => number;
}

/** F0 尚未實作的變體被傳進來時丟這個，而不是安靜地當成 basic 跑。 */
export class UnsupportedRuleError extends Error {
  constructor(public readonly kind: PinRule['kind']) {
    super(`難度變體 "${kind}" 尚未實作（F1 工作項，見設計文件 §7）`);
    this.name = 'UnsupportedRuleError';
  }
}

export class LockState {
  readonly pinCount: number;
  readonly falseCount: number;
  readonly degPerPin: number;
  readonly severeAt: number;
  readonly rules: readonly PinRule[];

  private readonly rng: () => number;
  /* 內部以 unknown payload 存放，在 on()/emit() 的邊界轉型 ——
     直接用 { [E in LockEvent]?: LockListener<E>[] } 會讓泛型索引的 push()
     參數收斂成 never。對外的簽章仍然是完全具型別的。 */
  private readonly listeners = new Map<LockEvent, ((payload: unknown) => void)[]>();

  /** 每個栓位的狀態，索引即栓位。 */
  pins: PinState[] = [];
  /** 哪幾支是假針。 */
  falsePins: ReadonlySet<PinIndex> = new Set();
  /** 真針必須被頂起的順序。 */
  trueOrder: readonly PinIndex[] = [];

  /** 本局累計錯誤次數（跨 clear 保留，用於結算）。 */
  errors = 0;
  /** 目前連續錯誤次數，成功一次就歸零。 */
  consecutive = 0;
  solved = false;

  constructor(opts: LockOptions = {}) {
    this.pinCount = opts.pinCount ?? 4;
    this.falseCount = opts.falseCount ?? 1;
    this.degPerPin = opts.degPerPin ?? 9;
    this.severeAt = opts.severeAt ?? 3;
    this.rules = opts.rules ?? [{ kind: 'basic' }];
    this.rng = opts.rng ?? Math.random;

    if (this.falseCount >= this.pinCount) {
      throw new RangeError(`假針數 ${this.falseCount} 必須少於總針數 ${this.pinCount}，否則沒有真針可解`);
    }
    for (const r of this.rules) {
      if (r.kind !== 'basic') throw new UnsupportedRuleError(r.kind);
    }

    this.newCombination();
  }

  on<E extends LockEvent>(event: E, fn: LockListener<E>): this {
    let list = this.listeners.get(event);
    if (!list) { list = []; this.listeners.set(event, list); }
    list.push(fn as (payload: unknown) => void);
    return this;
  }

  private emit<E extends LockEvent>(event: E, payload: LockEvents[E]): void {
    for (const fn of this.listeners.get(event) ?? []) fn(payload);
  }

  /** 重抽假針位置與真針順序，並清空盤面。 */
  newCombination(): void {
    const idx = [...Array(this.pinCount).keys()];
    for (let i = this.pinCount - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [idx[i], idx[j]] = [idx[j]!, idx[i]!];
    }
    this.falsePins = new Set(idx.slice(0, this.falseCount));
    this.trueOrder = idx.slice(this.falseCount);
    this.errors = 0;
    this.clear();
  }

  /** 清空盤面但保留這一局的組合。 */
  clear(): void {
    this.pins = Array.from({ length: this.pinCount }, () => 'idle' as PinState);
    this.consecutive = 0;
    this.solved = false;
  }

  /** 只要有任何一支假針卡著，整個鎖就推不動（§7）。 */
  get jammed(): boolean {
    return this.pins.some((s) => s === 'falseSet');
  }

  /**
   * 已經照順序固定了幾支真針。
   *
   * **這是計算屬性，不是儲存的欄位。** 舊版把它存成可變欄位，`release()` 只做
   * `progress--`，於是「把中間某支已固定的真針洩掉」會讓 progress 與實際盤面
   * 對不上，鎖進入無法推進的狀態（只能靠全部洩壓救回來）。
   * 從盤面推導就不會有那種不一致。詳見 tests/lock.test.ts 的對應測試。
   */
  get progress(): number {
    let p = 0;
    while (p < this.trueOrder.length && this.pins[this.trueOrder[p]!] === 'set') p++;
    return p;
  }

  /** 鎖芯角度 —— 事實層。假針不會讓它動（§9）。 */
  get cylinderDeg(): number {
    return this.progress * this.degPerPin;
  }

  /** 下一支該頂的真針；已解開則為 -1。 */
  get nextTruePin(): PinIndex {
    return this.trueOrder[this.progress] ?? -1;
  }

  push(i: PinIndex): PushResult {
    const cur = this.pins[i];
    if (cur === undefined) throw new RangeError(`栓位 ${i} 不存在（共 ${this.pinCount} 支）`);
    if (this.solved || cur === 'set' || cur === 'falseSet') return 'ignored';

    if (this.falsePins.has(i) && !this.jammed) {
      this.pins[i] = 'falseSet';
      this.emit('falseSet', { pin: i });
      return 'falseSet';
    }

    if (!this.jammed && i === this.nextTruePin) {
      this.pins[i] = 'set';
      this.consecutive = 0;
      this.emit('set', { pin: i });
      if (this.progress === this.trueOrder.length) {
        this.solved = true;
        this.emit('solved', {});
      }
      return 'set';
    }

    this.pins[i] = 'partial';
    this.errors++;
    this.consecutive++;
    this.emit('error', { pin: i });
    if (this.consecutive >= this.severeAt) {
      this.consecutive = 0;
      this.emit('severe', {});
    }
    return 'error' as PushResult;
  }

  /** 洩掉單支（設計文件 §4：熟練玩家的精準洩壓）。 */
  release(i: PinIndex): void {
    const was = this.pins[i];
    if (was === undefined) throw new RangeError(`栓位 ${i} 不存在（共 ${this.pinCount} 支）`);
    if (this.solved) return;
    this.pins[i] = 'idle';
    this.emit('release', { pin: i, was });
  }

  /** 全部洩壓（設計文件 §4：新手的整組重來）。 */
  releaseAll(): void {
    if (this.solved) return;
    this.pins = this.pins.map(() => 'idle' as PinState);
    this.emit('releaseAll', {});
  }

  /** 提示系統要用的答案（設計文件 §8）。 */
  getHint(): { order: PinIndex[]; falsePins: PinIndex[] } {
    return { order: [...this.trueOrder], falsePins: [...this.falsePins] };
  }
}

/** 用固定種子建鎖，測試與「每日挑戰」（F4）都會需要。 */
export function seededLock(seed: number, opts: Omit<LockOptions, 'rng'> = {}): LockState {
  return new LockState({ ...opts, rng: mulberry32(seed) });
}
