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
  private anchor = 0;
  private accrued = 0;
  /** 錯誤造成的時間損失（怪物瞬移換算，§6）。 */
  private penalty = 0;
  private playbackRate = 1;
  private readonly reasons = new Set<string>();

  constructor(private readonly now: () => number = () => performance.now()) {}

  start(): void {
    this.anchor = this.now();
    this.accrued = 0;
    this.penalty = 0;
  }

  /**
   * 開場演出期間反覆呼叫，讓計時器不啟動。
   *
   * `accrued` 與 `anchor` 要一起歸零；暫停中換新回合時也因此保持 0，直到所有
   * 具名暫停原因解除。觸發條件是死亡後自動重開，而 App 當時仍在背景。
   */
  hold(): void {
    this.anchor = this.now();
    this.accrued = 0;
  }

  addPenalty(seconds: number): void {
    this.penalty += seconds;
  }

  /** Debug playback only: preserve elapsed time while changing wall-clock speed. */
  setRate(rate: number): void {
    if (!Number.isFinite(rate) || rate < 0) {
      throw new RangeError('timer rate must be finite and non-negative');
    }
    this.capture();
    this.playbackRate = rate;
  }

  get rate(): number {
    return this.playbackRate;
  }

  /** Debug checkpoint only: move the clock to an exact elapsed value. */
  setElapsed(seconds: number): void {
    if (!Number.isFinite(seconds)) throw new RangeError('elapsed time must be finite');
    this.penalty += seconds - this.elapsed;
  }

  private capture(): void {
    const now = this.now();
    if (this.reasons.size === 0) {
      this.accrued += (now - this.anchor) / 1000 * this.playbackRate;
    }
    this.anchor = now;
  }

  /** 記下一個暫停原因。同一個原因重複記不會有副作用。 */
  pause(reason = 'manual'): void {
    if (this.reasons.size === 0) this.capture();
    this.reasons.add(reason);
  }

  /** 解除一個暫停原因；還有其他原因存在時計時器不會繼續走。 */
  resume(reason = 'manual'): void {
    const removed = this.reasons.delete(reason);
    if (removed && this.reasons.size === 0) this.anchor = this.now();
  }

  get paused(): boolean {
    return this.reasons.size > 0;
  }

  /** 目前有哪些原因讓計時器停著 —— dev overlay 會顯示。 */
  get pauseReasons(): string[] {
    return [...this.reasons];
  }

  /** 已經過的秒數，含錯誤懲罰。 */
  get elapsed(): number {
    const active = this.reasons.size === 0
      ? (this.now() - this.anchor) / 1000 * this.playbackRate
      : 0;
    return this.accrued + active + this.penalty;
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

/** Door 2 only reports the final decisive failure, never its whole history. */
export function door2Cause(pieceRetrieved: boolean, burnouts = 0): string {
  if (burnouts >= 2) return '備用保險絲也熔斷了';
  return pieceRetrieved ? '時間不夠' : '你太晚去拿保險絲';
}
