/* 環境衰變：緊急照明、牆面滲液、地板積水、水面倒影。
   隨站位推進逐級加重（CFG.seep.level），是「距離綁升壓」的一部分（§10）。 */

import * as THREE from 'three';
import { CFG } from '../logic/config.js';
import { mulberry32 } from '../logic/rng.js';
import { matMetal } from './materials.js';
import { boxGeo, planeGeo, scene } from './scene.js';

export const lamp = new THREE.PointLight(CFG.lamp.color, CFG.lamp.intensity, 34, 1.15);
lamp.position.set(0, CFG.lamp.y, CFG.lamp.z);
scene.add(lamp);

export const lampFixture = new THREE.Group();
lampFixture.position.copy(lamp.position);
scene.add(lampFixture);
{
  const housing = new THREE.Mesh(boxGeo, matMetal);
  housing.scale.set(0.44, 0.10, 0.20);
  lampFixture.add(housing);
  const tube = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xb9c8de }));
  tube.scale.set(0.36, 0.035, 0.13);
  tube.position.y = -0.05;
  lampFixture.add(tube);
  lampFixture.userData.tube = tube;
}

/* 走廊劣化 rig：每過一站，回頭看到的走廊更不對勁（PEGI 12：
   刮痕、傾倒、失靈與污漬，不用血腥）。變化只在玩家低頭時發生。 */

/* applied：已經套用到第幾級衰變。
   floor：這一扇門的**衰變下限** —— 跨門累進、跨局重置（v3 §10）。
   兩者分開的理由：門 2 的環境等級是 2，但怪物的站位要從 0 重新開始
   （牠被你跑掉了）。以前用 ST.index 同時表示這兩件事，一旦計時器解凍，
   怪物會從 22 公尺一次跳到 2.6 公尺 —— §6 明文禁止的橡皮筋。 */
export const decay = { applied: 0, floor: 0 };
/** 當前環境等級：門內隨站位升壓，但永遠不低於這扇門的下限。 */
export const envLevel = (stationIndex) => Math.max(decay.floor, stationIndex);
export const decayGroup = new THREE.Group();
scene.add(decayGroup);
export const decayStages = [];
{
  // 程序化刮痕貼片
  function scratchTex() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d');
    for (let i = 0; i < 26; i++) {
      c.strokeStyle = `rgba(12,10,9,${.25 + Math.random() * .5})`;
      c.lineWidth = .8 + Math.random() * 2.2;
      const y = Math.random() * 128, dy = (Math.random() - .5) * 30;
      c.beginPath(); c.moveTo(-8, y); c.lineTo(136, y + dy); c.stroke();
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const scratchMat = new THREE.MeshBasicMaterial({
    map: scratchTex(), transparent: true, opacity: 0.85, depthWrite: false,
  });
  const mkScratch = (x, y, z, w, h, ry) => {
    const m = new THREE.Mesh(planeGeo, scratchMat);
    m.scale.set(w, h, 1); m.position.set(x, y, z); m.rotation.y = ry;
    m.visible = false; decayGroup.add(m); return m;
  };
  // 遠處的第二盞燈（會死掉）
  const farTube = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x93a4bd }));
  farTube.scale.set(0.34, 0.03, 0.12); farTube.position.set(0, 2.82, 19.5);
  scene.add(farTube);
  const farLight = new THREE.PointLight(0x8fa3c0, 1.0, 12, 1.4);
  farLight.position.set(0, 2.7, 19.5); scene.add(farLight);
  // 提示牆上的深色抹痕（部分遮掩，不蓋掉序列）
  const smear = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
    color: 0x241a15, transparent: true, opacity: 0.55, depthWrite: false }));
  smear.scale.set(0.7, 0.5, 1);
  smear.rotation.y = Math.PI / 2;
  smear.position.set(-CFG.world.corridorW / 2 + 0.015, CFG.paint.baseY - 0.28, CFG.paint.wallZ + 0.5);
  smear.visible = false; decayGroup.add(smear);

  const s1 = mkScratch(-CFG.world.corridorW/2 + 0.01, 1.4, 9, 1.3, 0.9, Math.PI/2);
  const s2 = mkScratch( CFG.world.corridorW/2 - 0.01, 1.1, 7, 1.6, 1.1, -Math.PI/2);
  const s3 = mkScratch( CFG.world.corridorW/2 - 0.01, 1.5, 3.4, 1.2, 1.4, -Math.PI/2);

  // 每站的劣化內容（apply 只會被呼叫一次）
  decayStages.push(
    () => { farLight.intensity = 0.12; farTube.material.color.setScalar(0.10); },  // 站1→2 前奏：遠燈死
    () => { s1.visible = s2.visible = true; smear.visible = true; },               // 抹痕與刮痕出現
    () => { s3.visible = true; scene.fog.density = 0.062;                          // 深刮痕、霧變濃
            for (const d of scene.children) if (d.userData?.debris) d.rotation.z = 0.4; },
  );
  decayGroup.userData = { farLight, farTube };
}

/* 滲透 rig：程序化流體著色器（seep lab 移植）
   濕痕是靜的（既成事實），液珠是動的（還在流）。
   量只在玩家低頭時跳變；運動持續進行。
   注入 MeshStandardMaterial，所以吃手電筒的光 ——
   逐片段改寫 roughness 造成的高光落差，才是「液體」的讀法。 */
export const seepPatches = [];
export const seepUni = {
  uTime:      { value: 0 },
  uLevel:     { value: 0 },
  uColor:     { value: new THREE.Color(CFG.seep.color) },
  uSpread:    { value: CFG.seep.spread },
  uDrips:     { value: CFG.seep.drips },
  uDripW:     { value: CFG.seep.dripW },
  uRunLen:    { value: CFG.seep.runLen },
  uSpeed:     { value: CFG.seep.speed },
  uBead:      { value: CFG.seep.bead },
  uPoolAt:    { value: CFG.seep.poolAt },
  uRim:       { value: CFG.seep.rim },
  uGloss:     { value: CFG.seep.gloss },
  uWallRough: { value: CFG.seep.wallRough },
  uPuddleAt: { value: CFG.seep.puddleAt },
  uPuddleR:  { value: CFG.seep.puddleR },
  uFloodAt:   { value: CFG.seep.floodAt },
  uFloodC:    { value: CFG.seep.floodCenter },
  uFloodMax:  { value: CFG.seep.floodMax },
  uWaterRough:{ value: CFG.seep.waterRough },
  uSeepPos:   { value: Array.from({length:8}, () => new THREE.Vector2()) },
  uSeepCount: { value: 0 },
  uZ0:        { value: -2.0 },
  uZLen:      { value: 26.0 },
  uCorrW:     { value: CFG.world.corridorW },
};

export const SEEP_COMMON = `
uniform float uTime, uLevel, uSpread, uDrips, uDripW, uRunLen;
uniform float uSpeed, uBead, uPoolAt, uRim, uGloss, uWallRough, uSeed;
uniform float uPuddleAt, uPuddleR, uFloodAt, uFloodC, uFloodMax, uWaterRough;
uniform float uSeepCount, uZ0, uZLen, uCorrW;
uniform vec2 uSeepPos[8];
uniform vec3 uColor;
float sHash(float n){ return fract(sin(n * 127.1 + uSeed) * 43758.5453); }
`;

export const SEEP_BODY = `
  float seamV = 0.93;
  float dx = vUv.x - 0.5;
  float spread = 0.06 + uLevel * uSpread;

  float bandH = 0.018 + uLevel * 0.030;
  float band = smoothstep(seamV - bandH, seamV - bandH * 0.45, vUv.y)
             * (1.0 - smoothstep(seamV, seamV + 0.012, vUv.y))
             * smoothstep(spread, spread * 0.32, abs(dx));

  float trail = 0.0, bead = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi >= uDrips) break;
    float cx  = (sHash(fi * 3.13) - 0.5) * 1.85 * spread;
    float w   = uDripW * (0.45 + sHash(fi * 7.71)) * (0.45 + uLevel * 0.8);
    float ln  = uRunLen * (0.30 + sHash(fi * 5.31) * 0.85) * (0.28 + uLevel * 0.95);
    float sp  = (0.055 + sHash(fi * 11.3) * 0.075) * uSpeed;
    float ph  = sHash(fi * 17.9);
    float d   = abs(dx - cx);
    float colM = smoothstep(w, w * 0.30, d);

    float t = smoothstep(seamV - ln, seamV - ln * 0.88, vUv.y)
            * (1.0 - smoothstep(seamV, seamV + 0.006, vUv.y));
    trail = max(trail, colM * t * 0.82);

    float cyc  = fract(uTime * sp + ph);
    float head = seamV - cyc * cyc * ln;
    float ndx  = d / max(1e-4, w * uBead);
    float ndy  = (vUv.y - head) / max(1e-4, w * uBead * 2.3);
    float b    = 1.0 - smoothstep(0.45, 1.0, sqrt(ndx * ndx + ndy * ndy));
    b *= smoothstep(0.0, 0.12, cyc) * (1.0 - smoothstep(0.86, 1.0, cyc));
    bead = max(bead, b);
  }

  float pool = 0.0;
  if (uLevel > uPoolAt) {
    float ripple = 0.006 * sin(vUv.x * 34.0 + uTime * 1.1);
    pool = (1.0 - smoothstep(0.03, 0.085 + ripple, vUv.y))
         * smoothstep(spread * 1.4, spread * 0.5, abs(dx));
  }

  float cover = clamp(max(max(band, trail), max(bead, pool)), 0.0, 1.0);
  cover *= step(0.001, uLevel);
`;

export function makeSeepMaterial(seed) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, roughness: CFG.seep.gloss, metalness: 0.04,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  });
  mat.defines = { USE_UV: '' };
  mat.customProgramCacheKey = () => 'seep';
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, seepUni, { uSeed: { value: seed } });
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SEEP_COMMON)
      .replace('#include <map_fragment>', SEEP_BODY + `
        diffuseColor.rgb = uColor * (0.72 + uRim * bead + 0.18 * pool);
        diffuseColor.a  *= cover;
        if (diffuseColor.a < 0.004) discard;
      `)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = mix(uWallRough, uGloss, max(bead, max(band, pool)));
      `);
  };
  return mat;
}

{
  const rngS = mulberry32(CFG.world.seed ^ 0x5eed);
  for (let i = 0; i < CFG.seep.patches; i++) {
    const m = new THREE.Mesh(planeGeo, makeSeepMaterial(i * 37.7));
    const side = i % 2 ? 1 : -1;
    const seamY = CFG.seams.y[i % 2 === 0 ? 1 : 0];
    const z = 2.4 + rngS() * 13.5;
    const w = 0.55 + rngS() * 0.45;
    const h = seamY + 0.10;
    m.scale.set(w, h, 1);
    m.position.set(side * (CFG.world.corridorW / 2 - 0.026), seamY + 0.10 - h / 2, z);
    m.rotation.y = -side * Math.PI / 2;
    m.visible = false;
    scene.add(m);
    seepPatches.push({ mesh: m });
  }
}


export const WATER_BODY = `
  // 貼片 UV → 走廊世界座標
  float wx = (vUv.x - 0.5) * uCorrW;
  float wz = uZ0 + vUv.y * uZLen;

  float lvl = smoothstep(uPuddleAt, 1.0, uLevel);

  // 1. 滲透點下方的水窪：隨等級擴大
  float f = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uSeepCount) break;
    vec2 sp = uSeepPos[i];
    vec2 d = vec2(wx - sp.x, wz - sp.y);
    d.x *= 0.85;
    float r = uPuddleR * (0.55 + 2.6 * lvl);
    f = max(f, 1.0 - smoothstep(r * 0.55, r, length(d)));
  }

  // 2. 水線：水窪連成一片後，從中段往兩頭推進
  float flood = smoothstep(uFloodAt, 1.0, uLevel);
  float radius = uFloodMax * flood;
  float wobble = 0.45 * sin(wx * 1.7 + 2.1) + 0.30 * sin(wz * 0.9)
               + 0.18 * sin(wz * 2.6 + wx * 3.1);
  float sheet = 1.0 - smoothstep(radius - 0.9, radius + wobble, abs(wz - uFloodC));
  f = max(f, sheet * step(0.001, flood));

  // 3. 靠牆處水較深（水是從牆上流下來的）
  float toWall = 1.0 - smoothstep(0.0, uCorrW * 0.42, abs(abs(wx) - uCorrW * 0.5));
  f = min(1.0, f * (0.82 + 0.35 * toWall));

  // 4. 液滴落點的漣漪
  float ring = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uSeepCount) break;
    vec2 sp = uSeepPos[i];
    float dd = length(vec2(wx - sp.x, wz - sp.y));
    float rspd = 0.30 + sHash(float(i) * 9.13) * 0.28;
    float cyc = fract(uTime * rspd + sHash(float(i) * 4.71));
    float rr = cyc * (0.55 + 1.4 * lvl);
    ring += (1.0 - smoothstep(0.0, 0.045, abs(dd - rr))) * (1.0 - cyc) * step(0.06, cyc);
  }

  float cover = clamp(f, 0.0, 1.0);
  float rim = smoothstep(0.42, 0.62, cover) * (1.0 - smoothstep(0.62, 0.86, cover));
`;

export function makeWaterMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, roughness: CFG.seep.waterRough, metalness: 0.10,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
  });
  mat.defines = { USE_UV: '' };
  mat.customProgramCacheKey = () => 'water';
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, seepUni, { uSeed: { value: 3.7 } });
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SEEP_COMMON)
      .replace('#include <map_fragment>', WATER_BODY + `
        diffuseColor.rgb = uColor * (0.42 + 0.34 * ring + 0.30 * rim);
        diffuseColor.a  *= smoothstep(0.06, 0.34, cover) * 0.93;
        if (diffuseColor.a < 0.004) discard;
      `)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = mix(uWallRough * 0.7, uWaterRough, smoothstep(0.15, 0.6, cover));
      `);
  };
  return mat;
}



/* 積水裡的倒影：門前地面一小片，映出一個身後其實不存在的人形。
   用同一套「錯誤的人形」剪影，垂直翻轉 + 水面擾動。 */
export const reflection = (() => {
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 160;
  const c = cv.getContext('2d');
  const blob = (x, y, rx, ry, a) => {
    c.save(); c.translate(x, y); c.scale(rx / ry, 1); c.translate(-x, -y);
    c.fillStyle = `rgba(6,6,8,${a})`;
    c.beginPath(); c.arc(x, y, ry, 0, 6.283); c.fill(); c.restore();
  };
  // 倒立的人形：頭在下方（水面在腳邊）
  blob(48, 138, 12, 14, 0.95);          // 頭
  blob(48, 92, 20, 38, 0.95);           // 軀幹
  blob(30, 96, 7, 34, 0.85);            // 過長的左臂
  blob(66, 96, 7, 34, 0.85);            // 過長的右臂
  blob(41, 34, 8, 30, 0.8);             // 腿
  blob(55, 34, 8, 30, 0.8);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const m = new THREE.Mesh(planeGeo, mat);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(0.62, 1.15, 1);
  m.position.set(0.20, 0.008, -0.30);
  m.visible = false;
  scene.add(m);
  return { mesh: m, mat };
})();

/* 走廊水面：一整片地板貼片，覆蓋範圍由滲透點水窪 + 推進的水線決定 */
export const waterPlane = (() => {
  const Z0 = -2.0, ZLEN = 26.0;
  const m = new THREE.Mesh(planeGeo, makeWaterMaterial());
  m.rotation.x = -Math.PI / 2;
  m.scale.set(CFG.world.corridorW, ZLEN, 1);
  m.position.set(0, 0.004, Z0 + ZLEN / 2);
  m.visible = false;
  scene.add(m);
  // 把滲透點的世界座標餵進著色器
  const pts = seepUni.uSeepPos.value;
  seepPatches.forEach((p, i) => {
    if (i < 8) pts[i].set(p.mesh.position.x, p.mesh.position.z);
  });
  seepUni.uSeepCount.value = Math.min(8, seepPatches.length);
  return m;
})();

window.__applySeep = lv => {
  seepUni.uLevel.value = lv;
  for (const p of seepPatches) p.mesh.visible = lv > 0;
  waterPlane.visible = lv > CFG.seep.puddleAt;
};

/* 站位狀態：怪物只在玩家低頭時換站，回頭時一律靜止凝視 */
