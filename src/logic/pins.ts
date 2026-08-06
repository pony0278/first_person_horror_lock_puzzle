/**
 * 撞針的狀態與規則型別。
 *
 * 設計文件 §7：門鎖只有一種（撬鎖／撞針），變化來自「規則變體」而不是新介面。
 * 因此這裡把 F1 的四種變體先定成型別，F0 只實作 basic —— 目的是讓 F1 接手時
 * 不需要重新設計狀態機，而不是現在就把它們寫出來。
 */

/**
 * 撞針的四種狀態。設計文件 §7：
 * - `idle`     未動
 * - `partial`  推錯了：頂到約 40% 高度就頂住，推不上去
 * - `set`      對的針：順暢上到 100%、「喀」一聲固定，鎖芯累進轉一格
 * - `falseSet` 假的針：也順暢上到 100%、也固定住 —— 但鎖芯不轉
 *
 * `set` 與 `falseSet` 在下方面板上刻意幾乎無法分辨（§9），
 * 玩家必須比對上方鎖芯才知道差別。
 */
export type PinState = 'idle' | 'partial' | 'set' | 'falseSet';

/** `push()` 的結果。`ignored` 代表這一下沒有意義（已固定或已解開），不計入錯誤。 */
export type PushResult = PinState | 'ignored';

/** 撞針索引。就是 0-based 的栓位，命名只是為了讓函式簽章讀得出意思。 */
export type PinIndex = number;

/**
 * 難度變體（設計文件 §7）。
 *
 * **F0 只實作 `basic`。** 其餘四種是 F1 的工作，在這裡定型別是為了：
 * 1. `LockState` 的建構參數現在就吃 `PinRule[]`，F1 不必改簽章；
 * 2. 之後新增變體時，`applyRules()` 的 switch 少寫一種會被編譯器擋下來。
 */
export type PinRule =
  /** 基礎：4 針、1 假針。F0 的唯一配置。 */
  | { readonly kind: 'basic' }
  /** 滑落針：某支固定後會慢慢滑下，必須最後處理。 */
  | { readonly kind: 'slip'; readonly pin: PinIndex; readonly slipAfterMs: number }
  /** 雙生針：兩支必須連續頂起，中間不能碰其他針。 */
  | { readonly kind: 'twin'; readonly pins: readonly [PinIndex, PinIndex] }
  /** 多假針：假針數量的擴張（基礎是 1 支）。 */
  | { readonly kind: 'extraFalse'; readonly count: number }
  /** 六針：量的擴張。針數本身由 `LockOptions.pinCount` 決定，這條只是宣告意圖。 */
  | { readonly kind: 'moreP'; readonly pinCount: number };

/** 怪物的接近曲線（設計文件 §6）。三種都在時限末抵達，總時間守恆。 */
export type ApproachCurve = 'steady' | 'lurking' | 'pressing';

/**
 * 一扇門的配置（設計文件 §11 的難度池）。
 * F0 只有一扇，所以 `RunConfig` 目前用不到 —— 但型別先在這裡定好。
 */
export interface DoorConfig {
  readonly pinCount: number;
  readonly falseCount: number;
  /** 隱藏時限（秒）。設計文件 §11：門 1 是 25s、門 2 是 20s、門 3 是 18s。 */
  readonly limitSec: number;
  readonly rules: readonly PinRule[];
  readonly curve: ApproachCurve;
}

/** 一局＝三扇門（設計文件 §11）。死亡整局重來。 */
export interface RunConfig {
  readonly doors: readonly [DoorConfig, DoorConfig, DoorConfig];
}

/** F0 實際在跑的配置：4 針、1 假針、20 秒、等速型（設計文件 §17）。 */
export const F0_DOOR: DoorConfig = {
  pinCount: 4,
  falseCount: 1,
  limitSec: 20,
  rules: [{ kind: 'basic' }],
  curve: 'steady',
};
