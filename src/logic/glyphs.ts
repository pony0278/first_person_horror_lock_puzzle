/**
 * 撞針的顏色＋形狀符號（設計文件 §8）。
 *
 * 門 1 會依每局謎題把形狀重新綁定到實體撞針；牆面與剖面圖共用
 * DOOR1_GLYPHS，玩家看到的圖形才是同一個資訊單位。
 */
import type { PinPuzzleShape } from './pin-puzzle';

export interface Glyph {
  /** CSS 色碼。剖面圖與提示牆共用同一組，玩家才對得起來。 */
  readonly c: string;
  readonly s: string;
}

export const DOOR1_GLYPHS: Readonly<Record<PinPuzzleShape, Glyph>> = {
  circle:   { c: '#b85f58', s: '●' },
  triangle: { c: '#c9a94e', s: '▲' },
  square:   { c: '#5a7fc0', s: '■' },
  pentagon: { c: '#a87945', s: '⬟' },
};

/** 其他鎖針變體的後備圖形；門 1 顯示時由 puzzle.pinShapes 取代。 */
export const GLYPH: readonly Glyph[] = [
  DOOR1_GLYPHS.circle,
  DOOR1_GLYPHS.square,
  DOOR1_GLYPHS.triangle,
  { c: '#6a9e63', s: '◆' },
  DOOR1_GLYPHS.pentagon,
  { c: '#8d6ab0', s: '✚' },
];