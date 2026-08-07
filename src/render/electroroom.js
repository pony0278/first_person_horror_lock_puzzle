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
tube(ELECTRO.gapZ - 1.05, 1.15);                                         // B 段殘餘：更遠處 → 門 2 方向
add(cylGeo, matMetal, 0.03, 0.9, 0.03, wallX + 0.06, CY - 0.13, Z - 0.6, Math.PI / 2); // 副管

/* 缺口兩端：空支架（C 形夾的上下兩爪）＋垂落線頭 */
for (const gz of [ELECTRO.gapZ + 0.35, ELECTRO.gapZ - 0.35]) {
  add(boxGeo, matMetal, 0.05, 0.02, 0.06, wallX + 0.06, CY + 0.055, gz);
  add(boxGeo, matMetal, 0.05, 0.02, 0.06, wallX + 0.06, CY - 0.055, gz);
}
const wire = add(boxGeo, matDark, 0.012, 0.34, 0.012, wallX + 0.07, CY - 0.19, ELECTRO.gapZ + 0.38);
wire.rotation.z = 0.35;                       // 垂落的線頭，微斜

/* ── 鬆脫段：缺口旁那 0.7m 的導管，就是玩家要扯下來的那一段 ──
   上一個受害者已經扯走了一段（缺口），這一段的支架也鬆了 —— 微斜、微光邊緣
   （v3 §4：可互動物帶微弱邊緣光，靜音與低亮度下可辨識）。
   拉 2~3 下才會脫落（v3 §5），jerk 動畫由 game/transit.js 驅動。 */
export const loosePiece = new THREE.Group();
export const LOOSE = {
  home: new THREE.Vector3(wallX + 0.075, CY - 0.012, ELECTRO.gapZ - 0.70),
  homeRotZ: 0.05,
};
loosePiece.position.copy(LOOSE.home);
loosePiece.rotation.z = LOOSE.homeRotZ;
electroRoom.add(loosePiece);
{
  const matLoose = new THREE.MeshStandardMaterial({
    color: 0x6a7178, roughness: 0.45, metalness: 0.5,
    emissive: 0x1c3340, emissiveIntensity: 0.55,   // 微光邊緣
  });
  const seg = new THREE.Mesh(cylGeo, matLoose);
  seg.scale.set(0.036, 0.7, 0.036); seg.rotation.x = Math.PI / 2;
  loosePiece.add(seg);
  // 兩端接頭（略粗）
  for (const dz of [-0.33, 0.33]) {
    const cap = new THREE.Mesh(cylGeo, matLoose);
    cap.scale.set(0.045, 0.05, 0.045); cap.rotation.x = Math.PI / 2;
    cap.position.z = dz; loosePiece.add(cap);
  }
  // 只剩一個支架還咬著（另一端懸空 —— 讀得出「鬆了」）
  const brk = new THREE.Mesh(boxGeo, matMetal);
  brk.scale.set(0.05, 0.02, 0.06); brk.position.set(-0.012, 0.055, 0.30);
  loosePiece.add(brk);
}
