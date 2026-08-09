/**
 * 調校參數 —— 從 f0_door_prototype_v28.html 原封不動搬過來，數值一個都沒改。
 *
 * 給它型別的理由：這 100 行的常數被 2600 行渲染碼引用，打錯一個鍵名
 * 在 JS 裡是 undefined 然後變成 NaN，畫面壞掉但不會有任何錯誤訊息。
 *
 * `ui.style` 是唯一會在執行期被改的欄位（按 U 做 A/B），因此不用 as const。
 */

/** 下方面板的兩種皮：機構剖面圖 / 長條軌道。狀態機不受影響。 */
export type UiStyle = 'cutaway' | 'bars';

export interface Config {
  /** 撞針鎖。設計文件 §17：F0 是 4 針、1 假針。 */
  lock: { pinCount: number; falseCount: number;
          /** 每支真針讓鎖芯轉的角度。§9：8~10°，45° 等於直接標答案。 */
          degPerPin: number;
          /** 連續錯幾次觸發怪物瞬移。 */
          severeAt: number;
          /** 推錯時針停在幾成高度（§7：約 40%）。 */
          partialH: number };
  /** 回合。§17：隱藏 20 秒、等速型。 */
  round: { limit: number; hintMs: number; grabMs: number; startDist: number; endDist: number };
  penalty: { severeJump: number; errorSec: number };
  render: { exposure: number; pixelRatio: number };
  light: { near: SpotParams; far: SpotParams;
           penumbra: number; distance: number; flicker: number; fill: number; ambient: number };
  fog: { density: number; color: number };
  vig: { inner: number; outer: number };
  world: { seed: number; corridorW: number; corridorH: number; segLen: number; segCount: number };
  look: { returnSpeed: number; hintYaw: number;
          /** 視角轉超過這個角度，下方停止接受輸入（§5）。 */
          blindAt: number };
  paint: { wallZ: number; width: number; height: number; baseY: number; erosion: number; drips: number };
  intro: IntroConfig;
  /** 門 1 → 門 2 過場（F1 切片）。時間單位秒，角度單位度。 */
  transit: TransitConfig;
  ui: { style: UiStyle };
  lamp: { z: number; y: number; intensity: number; color: number };
  stations: StationConfig;
  seams: { y: number[]; spacingZ: number; depth: number; width: number };
  seep: SeepConfig;
  dread: DreadConfig;
}

export interface SpotParams { intensity: number; decay: number; angle: number }

export interface IntroConfig {
  runFrom: number; runSec: number;
  /** 子彈時間的四個控制點，皆為「與提示牆的有號距離」（正 = 還沒到）。 */
  glanceEnter: number; glanceFull: number; glancePast: number; glanceExit: number;
  glanceSlow: number; glanceMaxYaw: number;
  handleSec: number; toolSec: number;
  bobFreq: number; bobAmp: number; rollAmp: number;
}

export interface TransitConfig {
  openSec: number; throughSec: number; throughDist: number;
  cornerSec: number; cornerYaw: number;
  /** 電力驟暗：下沉、全黑、回升（秒）。全黑的瞬間完成場景換裝。 */
  dipDown: number; dipHold: number; dipUp: number;
  runFrom: number; runSec: number;
  /** 變電室在左牆的 z 位置與經過時的轉頭參數 */
  electroZ: number; glanceMaxYaw: number; glanceIn: number; glanceOut: number;
  holdSec: number;
  /** 門 2 廊道套用的站位衰變等級（環境跨門累進，v3 §10） */
  stationIndex: number;
  restartMs: number;
  /** 取件（v3 §4/§5）：回頭轉超過這個角度，鬆脫段才算「在視野裡」 */
  grabYawMin: number;
  /** 每累積下拉多少 CSS px 算一次「扯」 */
  tugPx: number;
  /** 第二根手指「伸手」的命中半徑（CSS px）。鬆脫段本身只有 3.6cm 粗，
      幾何命中區在手機上比指尖還小 —— 判定用螢幕距離，不用 raycast。 */
  grabTapPx: number;
  /** 扯幾下脫落 */
  tugsNeeded: number;
  /** 脫落飛向手上的動畫秒數 */
  grabFlySec: number;
  /** 到手後停多久進結尾 */
  retrievedHoldSec: number;
  /** 在門 2 前閒置多久自動重開（線上版防卡死） */
  door2IdleSec: number;
}

export interface StationConfig {
  z: number[]; vis: number[];
  stareLimit: number; blinkSec: number;
  lurkEmptyMin: number; lurkEmptyMax: number; lurkGlanceMin: number;
  lurkStareRecount: number; armedStareSec: number;
  faceZ: number; faceGraceSec: number; faceRiseSec: number;
  frontMin: number; frontMax: number; frontGapSec: number;
  frontDurEye: number; frontDurRefl: number; frontDurLever: number;
  /** 門 2 專屬的正面事件（門 2 沒有鑰匙孔與拉把，見 v3 §7 的門面換裝） */
  frontDurBadge: number; frontDurGlitch: number;
  /** 各站位停留的時間比例，**總和必須為 1**（§6 總時間守恆，由 stationThresholds 檢查）。 */
  hold: number[];
  /** 門 2 的閱讀型追逐曲線：同為 20 秒，但把第一次可見延後到 7 秒。 */
  door2Hold: number[];
  settleMs: number;
}

export interface SeepConfig {
  color: string; patches: number; gloss: number; wallRough: number; spread: number;
  drips: number; dripW: number; runLen: number; speed: number; bead: number;
  poolAt: number; puddleAt: number; puddleR: number;
  floodAt: number; floodCenter: number; floodMax: number;
  waterRough: number; rim: number;
  level: number[]; lampDim: number[]; farDim: number[];
}

export interface DreadConfig {
  trackShake: number[]; shakeHz: number[]; tint: number[];
  kickbackAt: number; kickbackSec: number; dropAt: number; dropSec: number;
}

export const CFG: Config = {
  lock:   { pinCount: 4, falseCount: 1, degPerPin: 9, severeAt: 3, partialH: 0.40 },
  round:  { limit: 20, hintMs: 1000, grabMs: 1000, startDist: 26, endDist: 1.3 },
  penalty:{ severeJump: 3.5, errorSec: 0.4 },
  render: { exposure: 1.12, pixelRatio: 2.0 },
  light:  { near: { intensity: 7,  decay: 1.5, angle: 0.50 },   // 面對門：近距離不過曝
            far:  { intensity: 44, decay: 1.05, angle: 0.62 },  // 回頭：照得到油漆牆與怪物
            penumbra: 0.72, distance: 30, flicker: 0.05, fill: 1.0, ambient: 0.30 },
  fog:    { density: 0.045, color: 0x05060a },
  vig:    { inner: 0.34, outer: 0.98 },
  world:  { seed: 1337, corridorW: 2.4, corridorH: 3.0, segLen: 4.0, segCount: 8 },
  look:   { returnSpeed: 10, hintYaw: 180, blindAt: 60 }, // 線索留在側邊，後方走廊維持中央
  paint:  {
    wallZ: 2.8,          // 回頭看正後方時位於左側視野，不遮住走廊中央
    width: 1.35, height: 0.52, baseY: 1.45,
    erosion: 0.24,       // 小面積線索避免侵蝕吃掉辨識度
    drips: 3,
  },
  intro:  {
    runFrom: 10,         // 起跑點（門前公尺數）
    runSec: 2.2,
    // 子彈時間的四個控制點，皆為「與提示牆的有號距離」（正 = 還沒到）
    glanceEnter: 3.4,    // 開始減速
    glanceFull:  1.6,    // 進入全速慢動作
    glancePast: -0.5,    // 全速慢動作維持到牆後這裡
    glanceExit: -1.2,    // 完全恢復正常速度
    glanceSlow: 0.48,    // 只輕微拖慢，不讓提示牆接管整段氣氛
    glanceMaxYaw: 38,    // 掃到側邊線索，但走廊仍留在視野
    handleSec: 1.3,      // 壓門把 ×2、拉不開
    toolSec: 0.95,       // 工具插入鎖孔的演出
    bobFreq: 6.0, bobAmp: 0.05, rollAmp: 0.9,
  },
  transit: {
    openSec: 0.85, throughSec: 0.95, throughDist: 2.5,
    cornerSec: 0.6, cornerYaw: 68,
    dipDown: 0.10, dipHold: 0.10, dipUp: 0.24,
    runFrom: 9, runSec: 3.4,
    electroZ: 5.2, glanceMaxYaw: 52, glanceIn: 2.4, glanceOut: 1.0,
    holdSec: 2.2,
    stationIndex: 2,      // 門 2 廊道：滲液 0.55、燈 0.55 —— 世界在壞掉
    restartMs: 1800,
    grabYawMin: 130, tugPx: 48, tugsNeeded: 3, grabTapPx: 56,
    grabFlySec: 0.55, retrievedHoldSec: 1.6, door2IdleSec: 45,
  },
  ui:     { style: 'cutaway' },   // 'cutaway' | 'bars'（按 U 即時切換做 A/B）
  lamp:   { z: 14, y: 2.75, intensity: 2.6, color: 0x8fa3c0 },
  stations: {
    z: [22, 13.0, 6.5, 2.6], // 四個站位：走廊深處 → 燈下 → 中距 → 門前
    vis: [0, 1, 1, 0],       // 空 → 遠處剪影 → 看清楚（主場）→ 消失（然後你死）
    stareLimit: 1.4,         // 凝視超過這秒數，牠會趁燈閃的瞬間前進
    blinkSec: 0.18,          // 燈閃的長度
    // ── 潛伏：抵達最後一站後不現身，累積「空無」次數才貼臉 ──
    lurkEmptyMin: 2,         // 至少要看到幾次空走廊
    lurkEmptyMax: 3,         // 最多幾次（每局隨機）
    lurkGlanceMin: 0.30,     // 一次「回頭」要看滿幾秒才算一次空無
    lurkStareRecount: 1.1,   // 持續盯著空走廊，每隔這麼久再算一次空無
    armedStareSec: 0.9,      // 待發狀態下盯著空走廊這麼久，牠直接出現
    faceZ: 0.80,             // 貼臉時的距離（公尺）
    faceGraceSec: 1.0,       // 臉出現後的極限窗口 —— 這一秒不殺你
    faceRiseSec: 0.28,       // 「在視野裡升起」的那種出現方式，時長
    // ── 正面事件：潛伏期間，威脅也會出現在門這一側 ──
    frontMin: 1,             // 每局至少幾次正面事件
    frontMax: 2,             // 最多幾次
    frontGapSec: 2.4,        // 兩次事件之間的最小間隔
    frontDurEye: 1.15,       // 鑰匙孔眼睛的持續秒數
    frontDurRefl: 1.30,      // 積水倒影
    frontDurLever: 0.85,     // 門把被轉動
    frontDurBadge: 0.95,     // 門 2：有人從另一側刷卡
    frontDurGlitch: 0.70,    // 門 2：LCD 抖動＋斷線迸火花
    // 各站位停留的時間比例（總和 1.0）。第一站最久 —— 空白是張力的蓄水池
    hold: [0.35, 0.20, 0.15, 0.30],   // 門 1：7 / 11 / 14 / 20s，規則推理先給讀牆時間
    door2Hold: [0.35, 0.20, 0.15, 0.30], // 門 2：7 / 11 / 14 / 20s，先給讀盤再壓縮後段
    settleMs: 260,           // 跳站的位移時間（很短，像瞬移不像走路）
  },
  seams:  { y: [1.06, 2.12], spacingZ: 1.2, depth: 0.004, width: 0.004 },
  seep: {                    // Roy 於 seep lab 調校（2026-08-05）
    color: '#5e100c',        // 平台審核打回時改深鏽色 '#3d2018'
    patches: 8,
    gloss: 0.10,             // 液珠中心的粗糙度（越低越濕亮）
    wallRough: 0.80,         // 濕痕邊緣的粗糙度 —— 兩者的落差 = 液體感
    spread: 0.34,            // 沿縫橫向暈開的半寬（滿級）
    drips: 6,                // 流掛通道數（最多 8）
    dripW: 0.055,
    runLen: 0.85,
    speed: 1.0,              // 液珠下滑速度
    bead: 1.6,
    poolAt: 0.8,             // 幾級以上出現牆腳積水（牆面上的下緣層）
    puddleAt: 0.5,           // 幾級以上地板開始積水（站位 3 起）
    puddleR: 0.62,           // 積水最大半徑（公尺）
    floodAt: 0.62,          // 幾級以上水窪連成一片
    floodCenter: 9.0,       // 水線的擴張中心（走廊 z）
    floodMax: 15.0,         // 滿級時的水線半徑（公尺）
    waterRough: 0.045,      // 水面粗糙度
    rim: 0.55,               // 液珠的亮度提升
    level: [0, 0.18, 0.55, 1.0],   // 各站位的滲透量（只在低頭時跳變）
    lampDim: [1, 0.85, 0.55, 0.30],   // 緊急照明逐站變暗
    farDim:  [1, 0.95, 0.80, 0.60],   // 回頭手電筒逐站變弱
  },
  dread: {                   // 撬鎖面板承載威脅（Iron Lung 路線）
    trackShake: [0, 0.6, 1.6, 3.2],    // 各站位的軌道顫動幅度 px
    shakeHz:    [0, 3.0, 5.5, 9.0],
    tint:       [0, 0.06, 0.16, 0.34], // 軌道滲入暗紅的程度
    kickbackAt: 2,           // 從第幾站開始，鎖芯會自己回退半格
    kickbackSec: 5.0,        // 回退間隔
    dropAt: 3,               // 從第幾站開始，未固定的針會無故落下
    dropSec: 3.4,
  },
};
