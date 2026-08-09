/* 靜態場景：走廊、門、門把、鎖芯、鑰匙孔、兩支工具、灰塵。
   這些物件建立一次就不再重建，回合重置只是改它們的位置與可見性。 */

import * as THREE from 'three';
import { CFG } from '../logic/config.js';
import { view } from '../dom.js';
import { matCeil, matDark, matDoor, matFloor, matMetal, matWall } from './materials.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(CFG.fog.color, CFG.fog.density);

export const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 60);
camera.position.set(0, 1.62, 0);
scene.add(camera);

export const renderer = new THREE.WebGLRenderer({ antialias: devicePixelRatio < 2 });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = CFG.render.exposure;
renderer.setPixelRatio(Math.min(devicePixelRatio, CFG.render.pixelRatio));
view.appendChild(renderer.domElement);

export const planeGeo = new THREE.PlaneGeometry(1, 1);
export const boxGeo = new THREE.BoxGeometry(1, 1, 1);
export const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 16);

/* ── 走廊：玩家站在門前，走廊往身後延伸 ─────────────── */
const { corridorW: W, corridorH: H, segLen: L, segCount: N } = CFG.world;
export const corridorShell = new THREE.Group();
scene.add(corridorShell);
for (let i = 0; i < N; i++) {
  const g = new THREE.Group();
  g.position.z = i * L;
  const fl = new THREE.Mesh(planeGeo, matFloor);
  fl.rotation.x = -Math.PI / 2; fl.scale.set(W, L, 1); g.add(fl);
  const ce = new THREE.Mesh(planeGeo, matCeil);
  ce.rotation.x = Math.PI / 2; ce.position.y = H; ce.scale.set(W, L, 1); g.add(ce);
  for (const side of [-1, 1]) {
    const wl = new THREE.Mesh(planeGeo, matWall);
    wl.rotation.y = -side * Math.PI / 2;
    wl.position.set(side * W / 2, H / 2, 0);
    wl.scale.set(L, H, 1); g.add(wl);
  }
  corridorShell.add(g);
}

/* ── 牆面接縫：水平板縫 + 垂直板縫。滲透必須有來源。 ───── */
export const SEAM_Z0 = -1.2, SEAM_Z1 = 30;
export const corridorSeams = new THREE.Group();
scene.add(corridorSeams);
{
  const seamMat = new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.95 });
  const len = SEAM_Z1 - SEAM_Z0, midZ = (SEAM_Z0 + SEAM_Z1) / 2;
  for (const side of [-1, 1]) {
    const x = side * (CFG.world.corridorW / 2 - CFG.seams.depth / 2);
    // 水平接縫：凹陷長條
    for (const y of CFG.seams.y) {
      const m = new THREE.Mesh(boxGeo, seamMat);
      m.scale.set(CFG.seams.depth, CFG.seams.width, len);
      m.position.set(x, y, midZ);
      corridorSeams.add(m);
    }
    // 垂直接縫
    for (let z = SEAM_Z0; z < SEAM_Z1; z += CFG.seams.spacingZ) {
      const m = new THREE.Mesh(boxGeo, seamMat);
      m.scale.set(CFG.seams.depth, CFG.world.corridorH, CFG.seams.width);
      m.position.set(x, CFG.world.corridorH / 2, z);
      corridorSeams.add(m);
    }
  }
  // 牆腳線
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(boxGeo, seamMat);
    m.scale.set(0.035, 0.035, len);
    m.position.set(side * (CFG.world.corridorW / 2 - 0.018), 0.018, midZ);
    corridorSeams.add(m);
  }
}

/* ── 門：真正的門洞 + 門片 + 五金 ─────────────────────
   玩家站在門前約 0.9m，鎖佔畫面的主要位置。 */
export const DOOR_Z = -0.92;
export const door = new THREE.Group();
door.position.z = DOOR_Z;
scene.add(door);

export const DW = W * 0.86, DH = 2.15, FRAME = 0.13;

// 門框：四根，圍出一個往內凹的門洞
{
  const mk = (sx, sy, x, y, z, mat) => {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(sx, sy, 0.16); m.position.set(x, y, z); door.add(m); return m;
  };
  mk(FRAME, DH + FRAME * 2, -(DW / 2 + FRAME / 2), DH / 2, 0.02, matDoor);   // 左框
  mk(FRAME, DH + FRAME * 2,  (DW / 2 + FRAME / 2), DH / 2, 0.02, matDoor);   // 右框
  mk(DW + FRAME * 2, FRAME, 0, DH + FRAME / 2, 0.02, matDoor);               // 楣
  // 門洞周圍的牆（把門框以外補滿，避免看到走廊外的黑）
  const sideW = (W - DW - FRAME * 2) / 2;
  if (sideW > 0.01) {
    mk(sideW, H, -(DW / 2 + FRAME + sideW / 2), H / 2, 0.02, matWall);
    mk(sideW, H,  (DW / 2 + FRAME + sideW / 2), H / 2, 0.02, matWall);
  }
  mk(W, H - DH - FRAME, 0, DH + FRAME + (H - DH - FRAME) / 2, 0.02, matWall);
}

/* 門片掛在鉸鍊組上才能擺開（F1 過場）。鉸鍊在左框內緣；
   doorLeaf 把原點移回門中心，底下子物件沿用原本的座標。 */
export const doorHinge = new THREE.Group();
doorHinge.position.set(-DW / 2, 0, 0);
door.add(doorHinge);
export const doorLeaf = new THREE.Group();
doorLeaf.position.set(DW / 2, 0, 0);
doorHinge.add(doorLeaf);

// 門片：往內凹 0.07，門面在 z = -0.07
export const LEAF_Z = -0.07;
export const panelMesh = new THREE.Mesh(boxGeo, matDoor);
panelMesh.scale.set(DW, DH, 0.09);
panelMesh.position.set(0, DH / 2, LEAF_Z - 0.045);
doorLeaf.add(panelMesh);

// 門片上的兩塊凹槽（工業門的壓紋），讓它讀得出是「一扇門」
for (const [yy, hh] of [[DH * 0.70, DH * 0.34], [DH * 0.28, DH * 0.30]]) {
  const g = new THREE.Mesh(boxGeo, matDoor);
  g.scale.set(DW * 0.74, hh, 0.02);
  g.position.set(0, yy, LEAF_Z - 0.012);
  doorLeaf.add(g);
}
// 底部踢板
{
  const kick = new THREE.Mesh(boxGeo, matMetal);
  kick.scale.set(DW * 0.94, 0.26, 0.015);
  kick.position.set(0, 0.14, LEAF_Z + 0.004);
  doorLeaf.add(kick);
}
// 鉸鍊
for (const yy of [DH * 0.16, DH * 0.5, DH * 0.86]) {
  const hg = new THREE.Mesh(boxGeo, matMetal);
  hg.scale.set(0.05, 0.16, 0.05);
  hg.position.set(-DW / 2 + 0.02, yy, LEAF_Z + 0.01);
  doorLeaf.add(hg);
}
// 把手（壓下式）
export let doorLever;
export let doorLeverRose;                     // 門 2 換裝時跟拉把一起收（render/doorpanel.js）
{
  const rose = new THREE.Mesh(cylGeo, matMetal);
  rose.scale.set(0.055, 0.02, 0.055); rose.rotation.x = Math.PI / 2;
  rose.position.set(0.60, 1.02, LEAF_Z + 0.012); doorLeaf.add(rose);
  doorLeverRose = rose;
  doorLever = new THREE.Mesh(boxGeo, matMetal);
  doorLever.scale.set(0.16, 0.032, 0.032);
  doorLever.position.set(0.52, 1.02, LEAF_Z + 0.03); doorLeaf.add(doorLever);
}

/* ── 鎖組：固定座（含基準刻痕）＋ 會轉的鎖芯 ─────────── */
export const LOCK_Y = 1.30, LOCK_X = 0.38;    // 靠把手側，但保持在 55° FOV 內

// 鎖座刮痕：程序化，暗示有人在這裡撬過很久
export function makeScratchTexture() {
  const n = 128, cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const c = cv.getContext('2d');
  c.fillStyle = '#8a8f96'; c.fillRect(0, 0, n, n);
  for (let i = 0; i < 90; i++) {
    c.strokeStyle = `rgba(${40 + Math.random() * 60 | 0},${40 + Math.random() * 60 | 0},${45 + Math.random() * 60 | 0},${.15 + Math.random() * .5})`;
    c.lineWidth = .5 + Math.random() * 1.4;
    const x = Math.random() * n, y = Math.random() * n, a = Math.random() * 6.283, l = 6 + Math.random() * 34;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const matPlate = new THREE.MeshStandardMaterial({
  map: makeScratchTexture(), color: 0x6d737a, roughness: 0.55, metalness: 0.4,
});

export const plate = new THREE.Mesh(cylGeo, matPlate);
plate.scale.set(0.16, 0.022, 0.16); plate.rotation.x = Math.PI / 2;
plate.position.set(LOCK_X, LOCK_Y, LEAF_Z + 0.012);
doorLeaf.add(plate);

// 固定的基準刻痕：唯一能量出鎖芯轉角的東西（議題 10 的事實層）
export const refMark = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xb9c0c8, roughness: .5 }));
refMark.scale.set(0.014, 0.045, 0.016);
refMark.position.set(LOCK_X, LOCK_Y + 0.145, LEAF_Z + 0.028);
doorLeaf.add(refMark);

// 會轉的鎖芯：鑰匙孔與工具都掛在它底下，所以一起轉
export const cylinder = new THREE.Group();
cylinder.position.set(LOCK_X, LOCK_Y, LEAF_Z + 0.026);
doorLeaf.add(cylinder);
{
  const plug = new THREE.Mesh(cylGeo, matPlate);
  plug.scale.set(0.108, 0.016, 0.108); plug.rotation.x = Math.PI / 2;
  cylinder.add(plug);
  // 鑰匙孔：上圓下縫，隨鎖芯轉
  const kh = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x07080a }));
  kh.scale.set(0.026, 0.115, 0.01); kh.position.set(0, -0.016, 0.009); cylinder.add(kh);
  const khTop = new THREE.Mesh(cylGeo, new THREE.MeshBasicMaterial({ color: 0x07080a }));
  khTop.scale.set(0.030, 0.01, 0.030); khTop.rotation.x = Math.PI / 2;
  khTop.position.set(0, 0.034, 0.009); cylinder.add(khTop);
}

/* 鑰匙孔裡的眼睛：孔內原本就是黑的，放一顆亮色橢圓進去即成立 */
export const keyEye = new THREE.Group();
keyEye.position.set(0, 0.030, 0.0055);
cylinder.add(keyEye);
{
  const sclera = new THREE.Mesh(cylGeo, new THREE.MeshBasicMaterial({ color: 0xb9b2a4 }));
  sclera.scale.set(0.0135, 0.006, 0.0135);
  sclera.rotation.x = Math.PI / 2;
  keyEye.add(sclera);
  const iris = new THREE.Mesh(cylGeo, new THREE.MeshBasicMaterial({ color: 0x2a1c18 }));
  iris.scale.set(0.0062, 0.006, 0.0062);
  iris.rotation.x = Math.PI / 2;
  iris.position.z = 0.0016;
  keyEye.add(iris);
  const pupil = new THREE.Mesh(cylGeo, new THREE.MeshBasicMaterial({ color: 0x000000 }));
  pupil.scale.set(0.0026, 0.006, 0.0026);
  pupil.rotation.x = Math.PI / 2;
  pupil.position.z = 0.0026;
  keyEye.add(pupil);
  // 眼瞼：兩片與孔同色的板子，闔起來就是眨眼
  const lidMat = new THREE.MeshBasicMaterial({ color: 0x07080a });
  const lidT = new THREE.Mesh(boxGeo, lidMat);
  lidT.scale.set(0.030, 0.016, 0.004); lidT.position.set(0, 0.019, 0.004);
  const lidB = new THREE.Mesh(boxGeo, lidMat);
  lidB.scale.set(0.030, 0.016, 0.004); lidB.position.set(0, -0.019, 0.004);
  keyEye.add(lidT, lidB);
  keyEye.userData = { lidT, lidB, iris };
}
keyEye.visible = false;

/* ── 工具：真的插在鑰匙孔裡，掛在鎖芯底下所以會跟著轉 ── */
export const pickTool = new THREE.Group();
cylinder.add(pickTool);
{
  // 撬針：桿身沒入孔內，只有握柄朝玩家伸出
  const shaft = new THREE.Mesh(boxGeo, matMetal);
  shaft.scale.set(0.009, 0.009, 0.085); shaft.position.set(0, 0, 0.034);
  pickTool.add(shaft);
  const handle = new THREE.Mesh(boxGeo, matMetal);
  handle.scale.set(0.022, 0.014, 0.12); handle.position.set(0, 0, 0.130);
  pickTool.add(handle);
  const tip = new THREE.Mesh(boxGeo, matMetal);
  tip.scale.set(0.008, 0.018, 0.010); tip.position.set(0, 0.010, -0.004);
  pickTool.add(tip);
  pickTool.userData.shaft = shaft;
  pickTool.userData.insert = 0.12;   // 入孔動畫的起始外移量
  pickTool.visible = false;
}
// 張力扳手：插在孔的下緣，柄向下
export const wrench = new THREE.Group();
cylinder.add(wrench);
{
  const w1 = new THREE.Mesh(boxGeo, matMetal);
  w1.scale.set(0.013, 0.013, 0.065); w1.position.set(0, -0.055, 0.026); wrench.add(w1);
  const w2 = new THREE.Mesh(boxGeo, matMetal);
  w2.scale.set(0.013, 0.15, 0.013); w2.position.set(0, -0.135, 0.055); wrench.add(w2);
  wrench.userData.insert = 0.12;
  wrench.visible = false;
}

/* ── 門周圍的環境：讓這裡像個廢棄設施而不是一堵牆 ───── */
export const doorEnvironment = new THREE.Group();
scene.add(doorEnvironment);
{
  // 門上方壞掉的照明（不發光，只是一具屍體）
  const dead = new THREE.Mesh(boxGeo, matMetal);
  dead.scale.set(0.5, 0.09, 0.18);
  dead.position.set(0, DH + FRAME + 0.30, DOOR_Z + 0.22);
  dead.rotation.z = 0.14;
  doorEnvironment.add(dead);
  const wire = new THREE.Mesh(cylGeo, matMetal);
  wire.scale.set(0.008, 0.22, 0.008);
  wire.position.set(0.12, DH + FRAME + 0.45, DOOR_Z + 0.22);
  doorEnvironment.add(wire);

  // 天花板管線，通到門的上方
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(cylGeo, matMetal);
    const r = 0.05 + i * 0.012;
    p.scale.set(r, 8, r); p.rotation.x = Math.PI / 2;
    p.position.set(-W / 2 + 0.28 + i * 0.16, H - 0.22 - (i % 2) * 0.1, DOOR_Z + 4.2);
    doorEnvironment.add(p);
  }
  // 門邊的雜物
  for (let i = 0; i < 5; i++) {
    const d = new THREE.Mesh(boxGeo, matDoor);
    const sz = 0.14 + Math.random() * 0.26;
    d.scale.set(sz, sz * (0.5 + Math.random() * 0.6), sz * (0.7 + Math.random() * 0.7));
    const side = i % 2 ? 1 : -1;
    d.position.set(side * (W / 2 - 0.22 - Math.random() * 0.3), d.scale.y / 2,
                   DOOR_Z + 0.5 + Math.random() * 1.6);
    d.rotation.y = Math.random() * Math.PI;
    d.userData.debris = true;
    doorEnvironment.add(d);
  }
}

/* ── 空氣中的灰塵：最便宜的陰森感 ─────────────────────── */
/* ── 門後前室：開門後看得到的深度（F1 過場） ─────────────
   平時整段藏在門片後面。左牆後半是開口 —— 「拐彎」的去向；
   轉頭時前室端牆填滿視野，電力驟暗的瞬間完成場景換裝（見 game/transit.js）。 */
export const vestibule = new THREE.Group();
{
  const VZ0 = -1.0, VL = 3.4;                  // 前室從門後延伸到 z = -4.4
  const midZ = VZ0 - VL / 2;
  const fl = new THREE.Mesh(planeGeo, matFloor);
  fl.rotation.x = -Math.PI / 2; fl.scale.set(W, VL, 1);
  fl.position.set(0, 0, midZ); vestibule.add(fl);
  const ce = new THREE.Mesh(planeGeo, matCeil);
  ce.rotation.x = Math.PI / 2; ce.scale.set(W, VL, 1);
  ce.position.set(0, H, midZ); vestibule.add(ce);
  // 右牆整段
  const wr = new THREE.Mesh(planeGeo, matWall);
  wr.rotation.y = -Math.PI / 2; wr.scale.set(VL, H, 1);
  wr.position.set(W / 2, H / 2, midZ); vestibule.add(wr);
  // 左牆只有前半，後半是轉角開口
  const solid = 1.4;
  const wl = new THREE.Mesh(planeGeo, matWall);
  wl.rotation.y = Math.PI / 2; wl.scale.set(solid, H, 1);
  wl.position.set(-W / 2, H / 2, VZ0 - solid / 2); vestibule.add(wl);
  // 端牆：面向玩家，轉頭時填滿視野的那面
  const back = new THREE.Mesh(planeGeo, matWall);
  back.scale.set(W, H, 1);
  back.position.set(0, H / 2, VZ0 - VL); vestibule.add(back);
  // 開口外的黑：一大片吸光板，讓轉角看起來通向更深的地方
  const void_ = new THREE.Mesh(planeGeo, matDark);
  void_.rotation.y = Math.PI / 2; void_.scale.set(VL + 2, H + 1, 1);
  void_.position.set(-W / 2 - 1.4, H / 2, midZ - 0.6); vestibule.add(void_);
}
scene.add(vestibule);

export const dust = (() => {
  const N = 420, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * W * 0.95;
    pos[i * 3 + 1] = Math.random() * H;
    pos[i * 3 + 2] = DOOR_Z + Math.random() * 9;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    color: 0xa8b2bf, size: 0.011, sizeAttenuation: true,
    transparent: true, opacity: 0.34, depthWrite: false, fog: true,
  });
  const p = new THREE.Points(g, m);
  scene.add(p);
  return p;
})();
