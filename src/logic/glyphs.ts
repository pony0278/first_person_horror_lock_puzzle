/**
 * 撞針的顏色＋形狀符號（設計文件 §8）。
 *
 * 門 1 的符號是撞針身分，點數是題目數值；牆面與剖面圖共用 GLYPH，
 * 玩家不需要在兩套符號之間轉譯。
 */
export interface Glyph {
  readonly c: string;
  readonly s: string;
}

export const GLYPH: readonly Glyph[] = [
  { c: '#c05a52', s: '●' },
  { c: '#5a7fc0', s: '■' },
  { c: '#c9a94e', s: '▲' },
  { c: '#6a9e63', s: '◆' },
  { c: '#b0763f', s: '⬟' },
  { c: '#8d6ab0', s: '✚' },
];