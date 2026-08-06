/* 提示牆與後製：油漆提示、指示燈、手電筒、補光、暗角。
   暗角刻意不連續（§10：連續變化會洩漏精確距離，讓回頭失去意義）。 */

import * as THREE from 'three';
import { CFG } from '../logic/config.js';
import { GLYPH } from '../logic/glyphs.js';
import { R } from '../state.js';
import { boxGeo, camera, planeGeo, scene } from './scene.js';

export function makePaintTexture(order) {
  const w = 512, h = 320;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const P = CFG.paint;

  const cell = w / order.length;
  order.forEach((pinIdx, k) => {
    const cx = cell * (k + 0.5) + (Math.random() - 0.5) * 14;
    const cy = h * 0.42 + (Math.random() - 0.5) * 22;
    const r = cell * 0.30;
    ctx.fillStyle = GLYPH[pinIdx].c;
    ctx.strokeStyle = GLYPH[pinIdx].c;
    ctx.lineWidth = r * 0.34;
    ctx.lineJoin = 'round';
    const rot = (Math.random() - 0.5) * 0.18;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);

    const shape = pinIdx % 4;
    ctx.beginPath();
    if (shape === 0) ctx.arc(0, 0, r, 0, Math.PI * 2);                      // ●
    if (shape === 1) ctx.rect(-r * .85, -r * .85, r * 1.7, r * 1.7);        // ■
    if (shape === 2) { ctx.moveTo(0, -r); ctx.lineTo(r * .95, r * .8);      // ▲
                       ctx.lineTo(-r * .95, r * .8); ctx.closePath(); }
    if (shape === 3) { ctx.moveTo(0, -r * 1.05); ctx.lineTo(r * .8, 0);     // ◆
                       ctx.lineTo(0, r * 1.05); ctx.lineTo(-r * .8, 0); ctx.closePath(); }
    ctx.fill();
    ctx.restore();

    // 流掛：符號下緣往下拖出漸淡的細線
    for (let d = 0; d < P.drips / order.length + 1; d++) {
      const dx = cx + (Math.random() - 0.5) * r * 1.6;
      const dy = cy + r * (0.7 + Math.random() * 0.3);
      const len = 20 + Math.random() * 70;
      const g = ctx.createLinearGradient(0, dy, 0, dy + len);
      g.addColorStop(0, GLYPH[pinIdx].c);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(dx, dy, 2 + Math.random() * 2.5, len);
    }
  });

  // 剝落：隨機挖掉小塊，讓油漆吃進牆的紋理
  ctx.globalCompositeOperation = 'destination-out';
  const holes = w * h * P.erosion / 90;
  for (let i = 0; i < holes; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 1 + Math.random() * 3.5;
    ctx.globalAlpha = 0.35 + Math.random() * 0.55;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const paintMat = new THREE.MeshStandardMaterial({
  transparent: true, roughness: 0.9, metalness: 0,
  polygonOffset: true, polygonOffsetFactor: -1,
});
export const paintPlane = new THREE.Mesh(planeGeo, paintMat);
paintPlane.rotation.y = Math.PI / 2;          // 左牆 (x = -W/2)，面朝走廊內
paintPlane.scale.set(CFG.paint.width, CFG.paint.height, 1);
paintPlane.position.set(-CFG.world.corridorW / 2 + 0.012, CFG.paint.baseY, CFG.paint.wallZ);
scene.add(paintPlane);

export function repaint() {
  paintMat.map?.dispose();
  paintMat.map = makePaintTexture(R.lock.getHint().order);
  paintMat.needsUpdate = true;
}

/* 提示牆旁的故障指示燈：跑過時閃爍吸引注意（引導視線，不搶鏡頭） */
export const markerMat = new THREE.MeshBasicMaterial({ color: 0xd8b25a });
export const marker = new THREE.Mesh(boxGeo, markerMat);
marker.scale.set(0.05, 0.05, 0.03);
marker.position.set(-CFG.world.corridorW / 2 + 0.05, CFG.paint.baseY + 0.75, CFG.paint.wallZ);
scene.add(marker);
export const markerLight = new THREE.PointLight(0xd8b25a, 0, 2.6, 1.8);
markerLight.position.copy(marker.position).x += 0.12;
scene.add(markerLight);

/* 開場序列：奔跑 → 撞門 → 壓門把拉不開 → 工具入孔 → 交出控制權 */

export const flash3d = new THREE.SpotLight(0xfff2d8, CFG.light.near.intensity, CFG.light.distance,
                                    CFG.light.near.angle, CFG.light.penumbra, CFG.light.near.decay);
flash3d.castShadow = false;
flash3d.position.set(0.10, -0.12, 0);
camera.add(flash3d);
flash3d.target.position.set(0.16, -0.30, -1);
camera.add(flash3d.target);
export const fill = new THREE.PointLight(0x9db0c8, CFG.light.fill, 3.2, 1.6);
camera.add(fill);
scene.add(new THREE.HemisphereLight(0x2a3140, 0x05070b, CFG.light.ambient));

/* ── 暗角 ───────────────────────────────────────────── */
export const vigMat = new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false,
  uniforms: { uInner:{value:CFG.vig.inner}, uOuter:{value:CFG.vig.outer}, uAspect:{value:1} },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vUv; uniform float uInner,uOuter,uAspect;
    void main(){ vec2 p=(vUv-0.5)*vec2(uAspect,1.0);
      gl_FragColor = vec4(0.0,0.0,0.0, smoothstep(uInner,uOuter,length(p))); }`,
});
export const vig = new THREE.Mesh(planeGeo, vigMat);
vig.frustumCulled = false; vig.renderOrder = 999; vig.position.z = -0.12;
camera.add(vig);
