/* 怪物：連續表面的錯誤人形（monster lab v3 移植）。
   設計文件 §10：距離 >10% 永遠是剪影，PEGI 12 下不做五官。 */

import * as THREE from 'three';
import { mulberry32 } from '../logic/rng.js';
import { scene } from './scene.js';

export const MP = {
  // 比例 —— 每一項都是「離正常多遠」的槓桿
  height: 2.05,        // 總身高（正常 ~1.75）
  legLen: 0.98,
  hunch: 16,           // 駝背前傾（度）
  shoulderW: 0.60,     // 肩寬（正常 ~0.45）
  armLen: 1.08,        // 臂長（正常 ~0.72 —— 過膝即「錯」）
  armThick: 0.048,
  neckH: 0.17,         // 脖子高（正常 ~0.09）
  headTilt: 12,        // 頭歪（度）
  headW: 0.155, headH: 0.235,
  stance: 0.14,
  gaunt: 0.70,         // 消瘦程度：腰凹、體側扁平、肋骨浮現
  asym: 0.55,          // 不對稱：肩高差、臂長差、脊椎側彎
  headYaw: 14,         // 頭轉開的角度（不正對你，更不安）
  jawDrop: 0.35,       // 下顎微張
  fingerLen: 0.12,     // 手指長度
  // ── 物種錯配：熟悉的形體 + 配錯的零件 ──
  digi: 0.75,          // 反關節後腿（0 = 人腿，1 = 趾行足）
  muzzle: 0.30,        // 上顎往前突出（人臉扁，獸臉突）
  eyeBlack: 1.0,       // 全黑無眼白（1 = 全黑濕眼，0 = 用反光眼）
  eyeWide: 0.0,        // 眼睛往兩側移（獵物的眼位長在掠食者臉上）
  noseSlit: 0.8,       // 無鼻，只有兩道鼻裂
  teeth: 0.35,         // 牙齒（過多、均一）—— PEGI 邊緣，克制使用
  // 皮膚
  skinBright: 0.72,    // 蒼白程度（0 黑 – 1 白）
  rough: 0.92,
  noiseAmp: 0.55,      // 皮膚噪聲（法線強度）
  // 眼睛
  socketScale: 1.0,    // 眼窩大小倍率
  eyeShine: 0.9,       // 反光眼強度（0 = 關）
  eyeSize: 0.015,
  eyeGap: 0.40,        // 兩眼距（頭寬比例)
  eyeHeight: 0.02,     // 相對頭心的高度
  // 微生命
  breathe: 1.0,
  sway: 1.0,
  // 貼臉顆粒
  grain: 0.35,
};

export let skinMat, socketMat, shineMat, blackEyeMat, toothMat;
export function buildMaterials() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  const img = c.createImageData(128, 128);
  const r = mulberry32(991);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = MP.noiseAmp * 46;
    img.data[i]   = 128 + (r() - 0.5) * a;
    img.data[i+1] = 128 + (r() - 0.5) * a;
    img.data[i+2] = 255;
    img.data[i+3] = 255;
  }
  c.putImageData(img, 0, 0);
  const nrm = new THREE.CanvasTexture(cv);
  nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
  nrm.repeat.set(3, 3);

  const g = Math.round(MP.skinBright * 255);
  const col = (g << 16) | (Math.round(g * 0.965) << 8) | Math.round(g * 0.91);
  skinMat = new THREE.MeshStandardMaterial({
    color: col, roughness: MP.rough, metalness: 0, vertexColors: true,
    normalMap: nrm, normalScale: new THREE.Vector2(MP.noiseAmp, MP.noiseAmp),
  });
  socketMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1 });
  shineMat = new THREE.MeshStandardMaterial({
    color: 0x111111, emissive: 0xd8d2c0, emissiveIntensity: MP.eyeShine * 2.2,
  });
  // 濕潤的黑眼：極低粗糙度 → 手電筒只留一個小高光點
  blackEyeMat = new THREE.MeshStandardMaterial({
    color: 0x040405, roughness: 0.045, metalness: 0.15,
  });
  toothMat = new THREE.MeshStandardMaterial({ color: 0xb8ad98, roughness: 0.55 });
}

/* ═══════════════════════════════════════════════════════════
   怪物：連續表面的錯誤人形
   關鍵：不拼接基本體。沿脊椎生成環狀網格，半徑曲線帶凹陷
   （腰、鎖骨、眼窩），靠假 AO 頂點色把凹處壓暗 —— 凹面
   才有恐怖，凸面只有可愛。
   ═══════════════════════════════════════════════════════════ */
export let torsoRef = null, headRef = null;
export const SIDES = 12;

/* 由一串環（中心、橢圓半徑、頂點暗度）生成連續管狀網格 */
export function tubeGeometry(rings, capTop, capBot) {
  const pos = [], col = [], idx = [];
  for (const r of rings) {
    for (let j = 0; j < SIDES; j++) {
      const a = (j / SIDES) * Math.PI * 2;
      const x = Math.cos(a) * r.rx, z = Math.sin(a) * r.rz;
      // 環可繞 x 軸傾斜（脊椎彎曲）
      const ca = Math.cos(r.tilt || 0), sa = Math.sin(r.tilt || 0);
      pos.push(r.c.x + x, r.c.y + z * sa, r.c.z + z * ca);
      // 側面比正面暗一點：假 AO 的第一層
      const side = 0.82 + 0.18 * Math.abs(Math.cos(a));
      const d = (r.ao ?? 1) * side;
      col.push(d, d, d);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < SIDES; j++) {
      const a = i * SIDES + j, b = i * SIDES + (j + 1) % SIDES;
      const c = a + SIDES, d = b + SIDES;
      idx.push(a, c, b, b, c, d);
    }
  }
  const capRing = (ringIdx, up) => {
    const r = rings[ringIdx];
    const ci = pos.length / 3;
    pos.push(r.c.x, r.c.y + (up ? r.rx * 0.5 : -r.rx * 0.5), r.c.z);
    const d = (r.ao ?? 1) * 0.8;
    col.push(d, d, d);
    for (let j = 0; j < SIDES; j++) {
      const a = ringIdx * SIDES + j, b = ringIdx * SIDES + (j + 1) % SIDES;
      if (up) idx.push(a, ci, b); else idx.push(b, ci, a);
    }
  };
  if (capTop) capRing(rings.length - 1, true);
  if (capBot) capRing(0, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* 沿一條路徑生成錐狀肢體 */
export function limbRings(from, to, r0, r1, bend, bendAxis) {
  const rings = [], N = 7;
  const dir = to.clone().sub(from);
  const len = dir.length();
  const perp = (bendAxis || new THREE.Vector3(0, 0, 1)).clone().normalize();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const c = from.clone().lerp(to, t);
    c.addScaledVector(perp, Math.sin(t * Math.PI) * bend * len);
    const rr = r0 + (r1 - r0) * t;
    rings.push({ c, rx: rr, rz: rr * 0.86, ao: 0.78 + 0.22 * (1 - Math.abs(0.5 - t) * 2) });
  }
  return rings;
}

export function buildMonsterMesh() {
  buildMaterials();
  const g = new THREE.Group();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const mesh = geo => new THREE.Mesh(geo, skinMat);

  const legTop = MP.legLen;
  const torsoLen = MP.height - MP.legLen - MP.neckH - MP.headH;
  const gz = 1 - MP.gaunt * 0.42;             // 消瘦 → 體側更扁
  const asymL = 1 + MP.asym * 0.08, asymR = 1 - MP.asym * 0.05;

  /* ── 軀幹：半徑曲線帶腰凹與鎖骨窪 ── */
  const prof = [
    // t,     rx 比例, rz 比例, ao
    [0.00, 1.02, 0.86, 0.72],   // 骨盆
    [0.16, 0.86, 0.68, 0.62],   // 腰（凹）
    [0.30, 0.80, 0.60, 0.58],   // 最細處
    [0.50, 0.96, 0.70, 0.78],   // 下胸
    [0.68, 1.06, 0.74, 0.88],   // 上胸（肋骨）
    [0.82, 1.02, 0.66, 0.70],   // 鎖骨下的凹
    [0.92, 1.18, 0.60, 0.95],   // 肩線（寬而扁）
    [1.00, 0.42, 0.40, 0.55],   // 頸根（急縮）
  ];
  const baseRX = MP.shoulderW * 0.42;
  const hunchRad = THREE.MathUtils.degToRad(MP.hunch);
  const torso = new THREE.Group();
  torso.position.y = legTop;
  g.add(torso);
  torsoRef = torso;
  {
    const rings = prof.map(([t, fx, fz, ao]) => {
      const bend = Math.pow(t, 1.7) * hunchRad;               // 上半身前傾
      const lean = Math.sin(t * Math.PI) * MP.asym * 0.035;    // 脊椎側彎
      const gaunt = 1 - MP.gaunt * 0.20 * (1 - Math.abs(0.5 - t) * 1.4);
      return {
        c: V(lean, t * torsoLen, -Math.sin(bend) * torsoLen * 0.30),
        rx: baseRX * fx * gaunt,
        rz: baseRX * fz * gz * gaunt,
        tilt: bend,
        ao: ao,
      };
    });
    torso.add(mesh(tubeGeometry(rings, true, true)));
    torso.userData.rings = rings;
  }
  const shoulderRing = torso.userData.rings[6];
  const neckRing = torso.userData.rings[7];

  /* ── 手臂：過長、錐狀、肘部彎曲，左右不等長 ── */
  for (const s of [-1, 1]) {
    const armLen = MP.armLen * (s < 0 ? asymL : asymR);
    const shY = shoulderRing.c.y + (s < 0 ? MP.asym * 0.03 : 0);   // 肩高差
    const sh = V(s * MP.shoulderW / 2, shY, shoulderRing.c.z);
    const elbow = V(s * (MP.shoulderW / 2 + 0.035), shY - armLen * 0.47, shoulderRing.c.z + 0.03);
    const wrist = V(s * (MP.shoulderW / 2 + 0.02), shY - armLen * 0.94, shoulderRing.c.z - 0.02);
    torso.add(mesh(tubeGeometry(
      limbRings(sh, elbow, MP.armThick, MP.armThick * 0.80, 0.06, V(0, 0, 1)), true, false)));
    torso.add(mesh(tubeGeometry(
      limbRings(elbow, wrist, MP.armThick * 0.80, MP.armThick * 0.52, -0.05, V(0, 0, 1)), false, false)));
    // 手掌：扁平
    const palmTop = wrist.clone();
    const palmBot = wrist.clone().add(V(0, -0.075, 0));
    const palm = limbRings(palmTop, palmBot, MP.armThick * 0.55, MP.armThick * 0.62, 0, V(0, 0, 1));
    for (const r of palm) { r.rz *= 0.45; r.rx *= 1.15; }
    torso.add(mesh(tubeGeometry(palm, false, false)));
    // 手指：過長、不等長、微張
    for (let f = 0; f < 4; f++) {
      const fx = (f - 1.5) * MP.armThick * 0.52;
      const fl = MP.fingerLen * (1 - Math.abs(f - 1.5) * 0.10);
      const a = palmBot.clone().add(V(fx, 0, 0));
      const b = a.clone().add(V(fx * 0.5, -fl, 0.012));
      torso.add(mesh(tubeGeometry(
        limbRings(a, b, MP.armThick * 0.20, MP.armThick * 0.11, 0.04, V(0, 0, 1)), true, false)));
    }
  }

  /* ── 脖子 ── */
  {
    const a = V(neckRing.c.x, neckRing.c.y, neckRing.c.z);
    const b = V(neckRing.c.x, neckRing.c.y + MP.neckH, neckRing.c.z - Math.sin(hunchRad) * MP.neckH * 0.5);
    const rings = limbRings(a, b, baseRX * 0.40, baseRX * 0.34, 0, V(0, 0, 1));
    for (const r of rings) r.ao = 0.55;
    torso.add(mesh(tubeGeometry(rings, false, false)));
    torso.userData.headAt = b;
  }

  /* ── 頭：變形球體，挖眼窩、收下顎、開口 ── */
  const head = new THREE.Group();
  const hp = torso.userData.headAt;
  head.position.set(hp.x, hp.y + MP.headH * 0.42, hp.z);
  head.rotation.z = THREE.MathUtils.degToRad(MP.headTilt);
  head.rotation.y = THREE.MathUtils.degToRad(MP.headYaw);
  torso.add(head);
  headRef = head;
  {
    const geo = new THREE.SphereGeometry(1, 20, 16);
    const pos = geo.attributes.position;
    const cols = [];
    const gap = MP.headW * (MP.eyeGap + MP.eyeWide * 0.35);
    const socketR = MP.eyeSize * 2.4 * MP.socketScale;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      x *= MP.headW; y *= MP.headH; z *= MP.headW * 0.90;
      // 上顎往前突出（獸吻）：下半臉沿 -z 拉出
      if (MP.muzzle > 0.01) {
        const lowerF = Math.max(0, -y / MP.headH);
        const front = Math.max(0, -z) / (MP.headW * 0.9);
        z -= lowerF * front * MP.muzzle * MP.headH * 0.62;
        y -= lowerF * front * MP.muzzle * MP.headH * 0.10;
      }
      // 下顎收窄 + 後腦扁平
      const lower = Math.max(0, -y / MP.headH);
      const narrow = 1 - lower * (0.30 + MP.jawDrop * 0.10);
      x *= narrow; z *= narrow;
      if (z > 0) z *= 0.86;                       // 後腦壓扁
      let dark = 1;
      // 挖眼窩：靠近窩心的頂點往內推，並壓暗
      for (const s of [-1, 1]) {
        const d = Math.hypot(x - s * gap, y - MP.eyeHeight, z + MP.headW * 0.86);
        const f = Math.max(0, 1 - d / (socketR * 2.0));
        if (f > 0) {
          const push = f * f * socketR * 1.5;
          const n = 1 / Math.max(1e-4, Math.hypot(x, y, z));
          x -= x * n * push; y -= y * n * push; z -= z * n * push;
          dark = Math.min(dark, 1 - f * 0.92);
        }
      }
      // 顴骨下的凹陷
      for (const s of [-1, 1]) {
        const d = Math.hypot(x - s * MP.headW * 0.72, y + MP.headH * 0.16, z + MP.headW * 0.55);
        const f = Math.max(0, 1 - d / (MP.headW * 0.55));
        if (f > 0) { const n = 1 / Math.max(1e-4, Math.hypot(x, y, z));
          const push = f * f * MP.headW * 0.20;
          x -= x * n * push; y -= y * n * push; z -= z * n * push;
          dark = Math.min(dark, 1 - f * 0.35); }
      }
      // 鼻：不存在。只有兩道朝下的裂縫 —— 頭骨的特徵，極便宜極有效
      if (MP.noseSlit > 0.01) {
        for (const sn of [-1, 1]) {
          const nx = (x - sn * MP.headW * 0.11) / (MP.headW * 0.075);
          const ny = (y - MP.headH * (0.02 - MP.muzzle * 0.06)) / (MP.headH * 0.085);
          const nz = Math.max(0, -z) / (MP.headW * 0.9);
          const f = Math.max(0, 1 - Math.hypot(nx, ny)) * nz;
          if (f > 0) {
            const n = 1 / Math.max(1e-4, Math.hypot(x, y, z));
            const push = f * MP.headH * 0.085 * MP.noseSlit;
            x -= x * n * push; y -= y * n * push; z -= z * n * push;
            dark = Math.min(dark, 1 - f * 0.90 * MP.noseSlit);
          }
        }
      }
      // 嘴：下半臉的橫向暗溝，微微內凹
      {
        const mx = Math.abs(x) / (MP.headW * 0.42), my = (y + MP.headH * 0.40) / (MP.headH * 0.13);
        const f = Math.max(0, 1 - Math.hypot(mx, my));
        if (f > 0) {
          const n = 1 / Math.max(1e-4, Math.hypot(x, y, z));
          const push = f * MP.headH * 0.10 * (0.4 + MP.jawDrop);
          x -= x * n * push; y -= y * n * push; z -= z * n * push;
          dark = Math.min(dark, 1 - f * 0.88);
        }
      }
      pos.setXYZ(i, x, y, z);
      cols.push(dark, dark, dark);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    head.add(new THREE.Mesh(geo, skinMat));
    // 眼球：全黑濕眼（無眼白 → 讀不出視線）或反光眼
    for (const s of [-1, 1]) {
      const useBlack = MP.eyeBlack > 0.5;
      const r = MP.eyeSize * (useBlack ? 1.55 : 1);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8),
        useBlack ? blackEyeMat : shineMat);
      eye.position.set(s * gap, MP.eyeHeight, -MP.headW * 0.86 + socketR * 0.55);
      head.add(eye);
      // 遠距離看不到黑眼 —— 補一顆極小的反光點維持剪影上的可讀性
      if (useBlack && MP.eyeShine > 0.01) {
        const spark = new THREE.Mesh(new THREE.SphereGeometry(MP.eyeSize * 0.30, 6, 5), shineMat);
        spark.position.set(s * gap - 0.004, MP.eyeHeight + 0.004, -MP.headW * 0.86 + socketR * 0.55 - r * 0.75);
        head.add(spark);
      }
    }
    // 牙：均一的一排（人的牙有分工，均一 = 錯的物種）
    if (MP.teeth > 0.05 && MP.jawDrop > 0.15) {
      const n = Math.round(6 + MP.teeth * 8);
      const mw = MP.headW * 0.42 * (1 - MP.muzzle * 0.15);
      const my = -MP.headH * (0.40 - MP.muzzle * 0.05);
      const mz = -MP.headW * 0.70 - MP.muzzle * MP.headH * 0.42;
      for (let i = 0; i < n; i++) {
        const u = (i / (n - 1) - 0.5) * 2;
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.0042, 0.014 * (0.7 + MP.teeth), 5), toothMat);
        t.position.set(u * mw, my + MP.headH * 0.035, mz + Math.abs(u) * MP.headW * 0.10);
        t.rotation.x = Math.PI;
        head.add(t);
        const b = t.clone();
        b.position.y = my - MP.headH * 0.045 * (0.5 + MP.jawDrop);
        b.rotation.x = 0;
        head.add(b);
      }
    }
  }

  /* ── 腿：digi 參數在「人腿」與「趾行反關節」之間插值 ──
     人：髖 → 膝(前) → 踝(地)
     獸：髖 → 膝(前) → 跗關節(後上方) → 蹠骨 → 趾著地
     剪影上這是最大的一個差異 —— 一眼就「不是人」，但整體還是人形。 */
  for (const s of [-1, 1]) {
    const shift = s * MP.stance / 2 + MP.asym * 0.02;
    const d = MP.digi;
    const hip = V(shift, legTop, 0);
    // 膝：digi 越高越往前、越高
    const knee = V(shift + s * 0.012, legTop * (0.48 + d * 0.10), 0.02 + d * 0.10
                   + (s < 0 ? MP.asym * 0.02 : 0));
    // 跗關節：往後翹起（反關節的視覺核心）
    const hock = V(shift + s * 0.016, legTop * (0.20 + d * 0.10), 0.02 - d * 0.16);
    // 蹠骨末端 → 趾著地：digi 高時腳跟離地
    const toe  = V(shift + s * 0.02, 0.03, -0.01 + d * 0.09);
    g.add(mesh(tubeGeometry(limbRings(hip, knee, 0.062, 0.044, 0.05, V(0, 0, 1)), false, false)));
    g.add(mesh(tubeGeometry(limbRings(knee, hock, 0.044, 0.030, -0.03, V(0, 0, 1)), false, false)));
    g.add(mesh(tubeGeometry(limbRings(hock, toe, 0.030, 0.022, 0.02 * (1 - d), V(0, 0, 1)), false, true)));
    if (d > 0.25) {   // 趾：著地的那一小段
      const tip = toe.clone().add(V(0, -0.015, -0.055 * d));
      g.add(mesh(tubeGeometry(limbRings(toe, tip, 0.022, 0.016, 0, V(0, 0, 1)), false, true)));
    }
  }

  return g;
}



export const monster = buildMonsterMesh();
scene.add(monster);
/* 微生命的錨點：軀幹（呼吸）與頭（歪斜擺動）。
   舊的 children[0]/[1] 索引已失效，改用具名參考。 */
export const monsterTorso = torsoRef, monsterHead = headRef;
/* 量測頭部高度：貼臉時要讓臉落在相機視線高度，
   否則 0.8m 距離下臉會被切在畫面上緣外（只看到胸口）。 */
export const MONSTER_HEAD_Y = (() => {
  monster.updateMatrixWorld(true);
  return monsterHead.getWorldPosition(new THREE.Vector3()).y;
})();
export const FACE_DROP = 1.62 - MONSTER_HEAD_Y + 0.02;            // 俯身湊近的下沉量（相機眼高 1.62）


/* 壞掉的緊急照明：現在是純氛圍與構圖用光源，
   怪物停在燈下那一站時會被它背光打成剪影。 */
