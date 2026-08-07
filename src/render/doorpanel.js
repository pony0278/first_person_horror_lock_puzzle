/* 門 2 的門面換裝：電磁門控（v3 §9 的事實層）。
 *
 * 門 2 的謎題在講電，門面不能還在講機械 —— doSwap 時把門 1 的機械鎖組
 * （鎖芯、拉把）收起來，換上這一組：
 *
 *   鎖孔位置 → 液晶面板：鎖定＝紅色實心橫槓（閂伸出的形狀），
 *              解鎖＝綠色缺口框（閂縮回的形狀）—— 顏色＋形狀，零文字（§8）。
 *   拉把位置 → 讀卡機：外殼被砸歪、半掛在一顆螺絲上，裸露的電路板、垂落的斷線
 *              —— 有人試圖破壞這扇門逃出去。牆上被扯走的那段導管就是他扯的，
 *              你撿回來的正是那一段。謎題的「為什麼」在門面上（§10 環境敘事）。
 *
 * LCD 不是二值的：它跟走廊燈吃同一條壞電路，紅色符號隨盤面 reach 越接越穩
 * —— 門面也是 reach 的事實層，跟 zap 音高互為備援（回頭時一眼／一耳就知道進度）。
 * 亮度全靠 emissive，不加新光源（燈的預算留給走廊）。 */

import * as THREE from 'three';
import { LEAF_Z, LOCK_X, LOCK_Y, boxGeo, cylGeo, doorLeaf } from './scene.js';
import { matDark, matMetal } from './materials.js';

export const doorPanel2 = new THREE.Group();
doorPanel2.visible = false;
doorLeaf.add(doorPanel2);

const matBezel = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.4, metalness: 0.6 });
const matGlass = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.15, metalness: 0.5 });
const matRed = new THREE.MeshStandardMaterial({
  color: 0x30100e, emissive: 0xd23b2f, emissiveIntensity: 0.9, roughness: 0.5,
});
const matGreen = new THREE.MeshStandardMaterial({
  color: 0x0e2a14, emissive: 0x37d16a, emissiveIntensity: 1.3, roughness: 0.5,
});
const matPcb = new THREE.MeshStandardMaterial({ color: 0x1d3a26, roughness: 0.75, metalness: 0.1 });
const matSparkM = new THREE.MeshBasicMaterial({ color: 0xcfe9ff });

const add = (parent, geo, mat, sx, sy, sz, x, y, z) => {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  parent.add(m); return m;
};

/* ── 液晶面板（鎖孔的位置）────────────────────────────── */
const Z = LEAF_Z + 0.018;
add(doorPanel2, boxGeo, matBezel, 0.17, 0.13, 0.024, LOCK_X, LOCK_Y, Z);
add(doorPanel2, boxGeo, matGlass, 0.135, 0.095, 0.006, LOCK_X, LOCK_Y, Z + 0.013);

/** 鎖定符號：實心橫槓 —— 閂伸出的形狀。 */
export const lcdRed = new THREE.Group();
lcdRed.position.set(LOCK_X, LOCK_Y, Z + 0.018);
doorPanel2.add(lcdRed);
add(lcdRed, boxGeo, matRed, 0.085, 0.022, 0.004, 0, 0, 0);

/** 解鎖符號：缺口框（右側開）—— 閂縮回、路通了的形狀。 */
export const lcdGreen = new THREE.Group();
lcdGreen.position.set(LOCK_X, LOCK_Y, Z + 0.018);
lcdGreen.visible = false;
doorPanel2.add(lcdGreen);
add(lcdGreen, boxGeo, matGreen, 0.085, 0.014, 0.004, 0, 0.030, 0);   // 上
add(lcdGreen, boxGeo, matGreen, 0.085, 0.014, 0.004, 0, -0.030, 0);  // 下
add(lcdGreen, boxGeo, matGreen, 0.014, 0.074, 0.004, -0.036, 0, 0);  // 左（右側缺口＝出口）

/* ── 讀卡機（拉把的位置）：被砸壞、外殼半脫落 ─────────── */
const RX = 0.56, RY = 1.02;
add(doorPanel2, boxGeo, matBezel, 0.15, 0.21, 0.022, RX, RY, Z);        // 底座
// 裸露的上半：電路板＋晶片＋排線座（外殼被扯掉的那一半）
add(doorPanel2, boxGeo, matPcb, 0.125, 0.095, 0.006, RX, RY + 0.048, Z + 0.012);
add(doorPanel2, boxGeo, matDark, 0.032, 0.032, 0.008, RX - 0.028, RY + 0.058, Z + 0.016);
add(doorPanel2, boxGeo, matDark, 0.05, 0.014, 0.008, RX + 0.024, RY + 0.032, Z + 0.016);
add(doorPanel2, boxGeo, matMetal, 0.012, 0.05, 0.008, RX + 0.045, RY + 0.062, Z + 0.016);
// 外殼下半還在：刷卡感應區的框
add(doorPanel2, boxGeo, matGlass, 0.11, 0.062, 0.006, RX, RY - 0.055, Z + 0.013);
// 被砸歪的上蓋：掛在右下那顆螺絲上，旋轉 ~24°
{
  const cover = new THREE.Mesh(boxGeo, matBezel);
  cover.scale.set(0.13, 0.10, 0.008);
  cover.position.set(RX + 0.075, RY - 0.010, Z + 0.022);
  cover.rotation.z = -0.42;
  doorPanel2.add(cover);
  add(doorPanel2, cylGeo, matMetal, 0.008, 0.012, 0.008, RX + 0.062, RY + 0.028, Z + 0.026);
}
// 垂落的斷線（跟變電室缺口的線頭同一種讀法）
for (const [dx, rz, len] of [[-0.030, 0.35, 0.085], [0.006, -0.2, 0.065]]) {
  const wire = new THREE.Mesh(boxGeo, matDark);
  wire.scale.set(0.006, len, 0.006);
  wire.position.set(RX + dx, RY + 0.10 - len / 2 + 0.01, Z + 0.018);
  wire.rotation.z = rz;
  doorPanel2.add(wire);
}
// 斷口的火花：小自發光片，間歇出現（同變電室 0x9fd8ff 一族的閃法）
const sparkMesh = add(doorPanel2, boxGeo, matSparkM, 0.016, 0.016, 0.004,
  RX - 0.026, RY + 0.088, Z + 0.020);
sparkMesh.visible = false;

// 門邊短導管：從門框方向接進讀卡機 —— 跟牆上那條是同一條管線
add(doorPanel2, cylGeo, matMetal, 0.016, 0.16, 0.016, RX + 0.002, RY + 0.19, Z - 0.004);

/* ── 狀態驅動（每幀由 game/door2 呼叫）─────────────────
   reach01：電流爬到第幾欄；solved：通電；lampF：走廊燈即時亮度。 */
export function setDoorPanel(reach01, solved, lampF, t) {
  if (!doorPanel2.visible) return;
  if (solved) {
    lcdRed.visible = false;
    lcdGreen.visible = true;
    sparkMesh.visible = false;
    return;
  }
  lcdRed.visible = true;
  lcdGreen.visible = false;
  // 電越接越穩：reach 低時紅槓虛弱地抖，接近通電時幾乎定住。
  // 走廊燈黑掉的瞬間（lampF 趨零）備援紅光也沉一下 —— 同一條壞電路。
  const stab = 0.25 + 0.75 * reach01;
  const noise = 0.45 + 0.55 * Math.abs(Math.sin(t * 31) * Math.sin(t * 8.3 + 1.7));
  matRed.emissiveIntensity =
    (0.35 + 0.85 * reach01) * (stab + (1 - stab) * noise) * (0.45 + 0.55 * Math.min(1, lampF * 1.6));
  // 斷口偶爾迸一下火花（讀卡機還在漏電 —— 它壞了，不是死了）
  sparkMesh.visible = (t % 1.9) < 0.07 || ((t + 0.83) % 3.1) < 0.05;
}

/** 歸位（resetTransit 呼叫）：門面交還門 1 的機械鎖。 */
export function resetDoorPanel() {
  doorPanel2.visible = false;
  lcdRed.visible = true;
  lcdGreen.visible = false;
  sparkMesh.visible = false;
  matRed.emissiveIntensity = 0.9;
}
