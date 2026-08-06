/**
 * mulberry32 —— 小、快、可重現的 PRNG。
 *
 * 原型裡兩個地方要用：程序化材質的種子（CFG.world.seed），
 * 以及測試與 F4 每日挑戰的固定種子（設計文件 §11）。
 */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
