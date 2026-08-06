/* 程序化材質：一份高度場衍生出顏色／粗糙度／法線三張貼圖。
   無貼圖檔案，全部在執行期生成（設計文件 §14：極低多邊形、無貼圖、純光照驅動）。 */

import * as THREE from 'three';
import { CFG } from '../logic/config.js';
import { mulberry32 } from '../logic/rng.js';

export let rngTex = mulberry32(CFG.world.seed);

export function makeHeightField(size, oct = 5) {
  const f = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < oct; o++) {
    const cells = 2 << o, grid = new Float32Array((cells + 1) ** 2);
    for (let i = 0; i < grid.length; i++) grid[i] = rngTex();
    const sc = size / cells;
    for (let y = 0; y < size; y++) {
      const gy = y / sc, y0 = Math.floor(gy), ty = gy - y0, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const gx = x / sc, x0 = Math.floor(gx), tx = gx - x0, sx = tx * tx * (3 - 2 * tx);
        const i0 = y0 * (cells + 1) + x0;
        const a = grid[i0], b = grid[i0 + 1], c = grid[i0 + cells + 1], d = grid[i0 + cells + 2];
        f[y * size + x] += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy);
      }
    }
    total += amp; amp *= 0.55;
  }
  for (let i = 0; i < f.length; i++) f[i] /= total;
  return f;
}
export function texFrom(f, size, lo, hi) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(size, size);
  for (let i = 0; i < f.length; i++) {
    const v = (lo + f[i] * (hi - lo)) * 255 | 0;
    img.data[i*4] = img.data[i*4+1] = img.data[i*4+2] = v; img.data[i*4+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}
export function normalFrom(f, size, k) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(size, size);
  const at = (x, y) => f[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x-1,y-1)+2*at(x-1,y)+at(x-1,y+1)) - (at(x+1,y-1)+2*at(x+1,y)+at(x+1,y+1));
    const dy = (at(x-1,y-1)+2*at(x,y-1)+at(x+1,y-1)) - (at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1));
    let nx = dx*k, ny = dy*k, nz = 1; const l = Math.hypot(nx,ny,nz);
    const i = (y*size+x)*4;
    img.data[i] = (nx/l*.5+.5)*255; img.data[i+1] = (ny/l*.5+.5)*255;
    img.data[i+2] = (nz/l*.5+.5)*255; img.data[i+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}

export const S = 256, field = makeHeightField(S);
export const tMap = texFrom(field, S, 0.72, 1.0),
      tRgh = texFrom(field, S, 0.62, 0.98),
      tNrm = normalFrom(field, S, 2.2);

export function concrete(tint, rx, ry) {
  const m = tMap.clone(), r = tRgh.clone(), n = tNrm.clone();
  for (const t of [m, r, n]) { t.repeat.set(rx, ry); t.needsUpdate = true; }
  return new THREE.MeshStandardMaterial({
    color: tint, map: m, roughnessMap: r, normalMap: n,
    normalScale: new THREE.Vector2(0.8, 0.8), roughness: 1, metalness: 0,
  });
}
export const matWall = concrete(0x8e9095, 2, 2.4);
export const matFloor = concrete(0x6a6c70, 2, 3);
export const matCeil = concrete(0x76787c, 2, 3);
export const matDoor = concrete(0x55585d, 1, 1.4);
export const matMetal = new THREE.MeshStandardMaterial({ color: 0x4e5257, roughness: .5, metalness: .45 });
export const matDark = new THREE.MeshBasicMaterial({ color: 0x000000 });
