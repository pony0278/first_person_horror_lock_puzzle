/**
 * 撞針的顏色＋圖形標記（設計文件 §8）。
 *
 * 門 1 會依每局謎題把五點軌道位置重新綁定到實體撞針；牆面與剖面圖
 * 共用 DOOR1_GLYPHS，玩家看到的是同一個空間位置，不需翻譯。
 */
import type { PinPuzzleMark } from './pin-puzzle';

export interface Glyph {
  readonly c: string;
  /** 非剖面介面與操作紀錄的文字後備符號。 */
  readonly s: string;
}

export interface Door1Glyph extends Glyph {
  readonly position: -2 | -1 | 0 | 1 | 2;
}

const MARK_COLOR = '#c8a34f';

export const DOOR1_GLYPHS: Readonly<Record<PinPuzzleMark, Door1Glyph>> = {
  left:       { c: MARK_COLOR, s: '◀', position: -2 },
  'near-left': { c: MARK_COLOR, s: '◁', position: -1 },
  center:     { c: MARK_COLOR, s: '●', position: 0 },
  'near-right': { c: MARK_COLOR, s: '▷', position: 1 },
  right:      { c: MARK_COLOR, s: '▶', position: 2 },
};

/** 其他鎖針變體的後備圖形；門 1 顯示時由 puzzle.pinMarks 取代。 */
export const GLYPH: readonly Glyph[] = [
  { c: '#c05a52', s: '●' },
  { c: '#5a7fc0', s: '■' },
  { c: '#c9a94e', s: '▲' },
  { c: '#6a9e63', s: '◆' },
  { c: '#b0763f', s: '⬟' },
  { c: '#8d6ab0', s: '✚' },
];