/**
 * 回合層的純邏輯：隱藏計時器、站位時刻表、失敗原因判定。
 *
 * 這裡刻意只放「不需要知道畫面長什麼樣」的部分。`newRound()` 之類還要重置
 * 場景物件的流程留在渲染層 —— 硬把它們搬進來只會讓這個檔案再依賴 Three.js。
 */

/** 一局結束時記錄的統計，結算與資料分析都用它。 */
export interface RoundStats {
  won: boolean;
  /** 實際經過秒數（可能超過時限 —— 極限成功，§6）。 */
  sec: number;
  /** 回頭觀察累計秒數。 */
  look: number;
  /** 卡在假針上的累計秒數。 */
  jam: number;
  errors: number;
  msg: string;
}

/**
 * 隱藏計時器（設計文件 §1、§6：沒有任何倒數 UI，怪物距離是唯一的時間資訊）。
 *
 * 用牆鐘而不是累加 dt，因為 dt 在低幀率時被 clamp（原型是 0.05s 上限），
 * 累加會讓時限隨幀率浮動 —— 怪物就不誠實了。
 *
 * 暫停是**具名的**：切到背景（H2）與 WebGL context 遺失（H3）可能同時發生，
 * 用單一布林值會讓其中一個先恢復就把計時器放行，而畫面其實還沒回來。
 * 因此記的是「還有哪些原因暫停中」，全部解除才真的繼續走。
 */
export class HiddenTimer {
  private t0 = 0;
  private pausedAt: number | null = null;
  /** 錯誤造成的時間損失（怪物瞬移換算，§6）。 */
  private penalty = 0;
  private readonly reasons = new Set<string>();

  constructor(private readonly now: () => number = () => performance.now()) {}

  start(): void {
    this.t0 = this.now();
    this.penalty = 0;
    // 若開新回合時仍在背景／context 未恢復，就直接以暫停狀態起跑
    this.pausedAt = this.reasons.size > 0 ? this.t0 : null;
  }

  /** 開場演出期間反覆呼叫，讓計時器不啟動。 */
  /**
   * 開場演出期間反覆呼叫，讓計時器不啟動。
   *
   * 暫停中也必須把 pausedAt 一起前移。只推 t0 的話，凍結的 pausedAt 會停在過去，
   * `elapsed = (pausedAt - t0)` 就變成負的而且愈來愈負 —— 玩家等於白拿時間。
   * 觸發條件是「暫停期間換了新回合」：死亡後 1.5 秒自動重開，而那時 App 在背景。
   */
  hold(): void {
    const now = this.now();
    this.t0 = now;
    if (this.pausedAt !== null) this.pausedAt = now;
  }

  addPenalty(seconds: number): void {
    this.penalty += seconds;
  }

  /** 記下一個暫停原因。同一個原因重複記不會有副作用。 */
  pause(reason = 'manual'): void {
    this.reasons.add(reason);
    if (this.pausedAt === null) this.pausedAt = this.now();
  }

  /** 解除一個暫停原因；還有其他原因存在時計時器不會繼續走。 */
  resume(reason = 'manual'): void {
    this.reasons.delete(reason);
    if (this.reasons.size > 0 || this.pausedAt === null) return;
    this.t0 += this.now() - this.pausedAt;
    this.pausedAt = null;
  }

  get paused(): boolean {
    return this.pausedAt !== null;
  }

  /** 目前有哪些原因讓計時器停著 —— dev overlay 會顯示。 */
  get pauseReasons(): string[] {
    return [...this.reasons];
  }

  /** 已經過的秒數，含錯誤懲罰。 */
  get elapsed(): number {
    const ref = this.pausedAt ?? this.now();
    return (ref - this.t0) / 1000 + this.penalty;
  }
}

/**
 * 把各站位的停留比例累加成切換時間點。
 *
 * 設計文件 §6：三種接近曲線的形狀不同，但**總時間守恆** —— 玩家永遠有相同的
 * 秒數，只是不知道那段時間長什麼形狀。因此比例必須加總為 1。
 */
export function stationThresholds(hold: readonly number[], limitSec: number): number[] {
  const total = hold.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 1) > 1e-6) {
    throw new RangeError(`站位停留比例總和必須為 1（總時間守恆，§6），目前是 ${total}`);
  }
  const out: number[] = [];
  let acc = 0;
  for (const h of hold) {
    acc += h;
    out.push(acc * limitSec);
  }
  return out;
}

export interface CauseInput {
  jamSec: number;
  lookSec: number;
  errorCount: number;
  /** 單次錯誤的時間成本，用來把錯誤次數換算成秒。 */
  errorSec: number;
}

/**
 * 結算只點名一個原因（設計文件 §12：列三條會稀釋教訓）。
 *
 * 取「損失時間最多」的那一項；若沒有任何一項超過門檻，就歸因於時間不夠。
 */
export function primaryCause(input: CauseInput, thresholdSec = 1.5): string {
  const candidates: readonly [string, number][] = [
    ['卡在假針太久', input.jamSec],
    ['回頭看太多次', input.lookSec],
    ['連續操作錯誤', input.errorCount * input.errorSec],
  ];
  const worst = [...candidates].sort((a, b) => b[1] - a[1])[0]!;
  return worst[1] > thresholdSec ? worst[0] : '時間不夠';
}
