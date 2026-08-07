/* 變電室：門 2 廊道左牆的場景換裝（F1 過場）。
 *
 * v3 §7：門 2 是通電管線謎題，缺的導管就來自這面牆 —— 變電室不是裝飾，
 * 是門 2 謎題的前提。它放在門 2 的「身後」方向：在門 2 前回頭時，
 * 你需要的東西和你害怕的東西在同一個視野裡。
 *
 * 這一版只做「經過時看得到」：機櫃、沿牆導管、以及導管上一段**缺口**
 * （兩個空支架＋垂落的線頭）—— 那就是 F1 後續要玩家取回的那一段。
 * 平時整組隱藏，過場換裝時顯示（見 game/transit.js）。
 */

import * as THREE from 'three';
import { CFG } from '../logic/config.js';
import { boxGeo, cylGeo, scene } from './scene.js';
import { matDark, matMetal } from './materials.js';

const W = CFG.world.corridorW;
const wallX = -W / 2;                        // 左牆
const Z = CFG.transit.electroZ;

/** 導管缺口的中心（transit 把火花燈移到這裡 —— 亮的是缺的那一段） */
export const ELECTRO = { gapZ: Z - 1.9, gapY: 2.22 };

const matCab = new THREE.MeshStandardMaterial({ color: 0x3d4348, roughness: 0.6, metalness: 0.5 });
const matHaz = new THREE.MeshStandardMaterial({ color: 0x8a7a2c, roughness: 0.8, metalness: 0.1 });

export const electroRoom = new THREE.Group();
electroRoom.visible = false;
scene.add(electroRoom);

const add = (geo, mat, sx, sy, sz, x, y, z, rx = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.x = rx;
  electroRoom.add(m); return m;
};

/* ── 機櫃 ── */
add(boxGeo, matCab, 0.16, 1.5, 0.95, wallX + 0.08, 1.05, Z);            // 櫃體
add(boxGeo, matMetal, 0.02, 1.3, 0.8, wallX + 0.175, 1.05, Z);          // 櫃門
for (let i = 0; i < 4; i++)                                              // 散熱縫
  add(boxGeo, matDark, 0.012, 0.03, 0.62, wallX + 0.19, 1.42 - i * 0.09, Z);
add(cylGeo, matMetal, 0.03, 0.04, 0.03, wallX + 0.19, 0.72, Z + 0.28);   // 門鎖旋鈕

/* 底部警示斜紋：黃黑相間，零文字（§8 符號原則） */
for (let i = 0; i < 6; i++)
  add(boxGeo, i % 2 ? matHaz : matDark, 0.02, 0.1, 0.14, wallX + 0.17, 0.24, Z - 0.38 + i * 0.15);

/* ── 沿牆導管：從機櫃頂沿著牆走向門 2 ──
   主管在中途斷了一段 —— 缺口兩端是空支架與垂落的線頭。 */
const CY = ELECTRO.gapY;                     // 導管高度
const tube = (z0, z1, y = CY) =>
  add(cylGeo, matMetal, 0.035, (z0 - z1), 0.035, wallX + 0.06, y, (z0 + z1) / 2, Math.PI / 2);

add(cylGeo, matMetal, 0.04, 0.75, 0.04, wallX + 0.06, 1.85 + 0.375, Z); // 機櫃頂垂直段
tube(Z, ELECTRO.gapZ + 0.35);                                            // A 段：機櫃 → 缺口
tube(ELECTRO.gapZ - 0.35, 1.15);                                         // B 段：缺口 → 門 2 方向
add(cylGeo, matMetal, 0.03, 0.9, 0.03, wallX + 0.06, CY - 0.13, Z - 0.6, Math.PI / 2); // 副管

/* 缺口兩端：空支架（C 形夾的上下兩爪）＋垂落線頭 */
for (const gz of [ELECTRO.gapZ + 0.35, ELECTRO.gapZ - 0.35]) {
  add(boxGeo, matMetal, 0.05, 0.02, 0.06, wallX + 0.06, CY + 0.055, gz);
  add(boxGeo, matMetal, 0.05, 0.02, 0.06, wallX + 0.06, CY - 0.055, gz);
}
const wire = add(boxGeo, matDark, 0.012, 0.34, 0.012, wallX + 0.07, CY - 0.19, ELECTRO.gapZ + 0.38);
wire.rotation.z = 0.35;                       // 垂落的線頭，微斜
