/* 門 1 的圖形等差題與後製。
   四個等距位置直接使用鎖內同款圖形；移除唯一破壞刻點等差規律的圖形後，
   剩餘圖形由左到右就是撬鎖順序，不再經過門面轉譯。 */

import * as THREE from 'three';
import rough from 'roughjs/bundled/rough.esm.js';
import { CFG } from '../logic/config.js';
import { GLYPH } from '../logic/glyphs.js';
import { mulberry32 } from '../logic/rng.js';
import { R } from '../state.js';
import { boxGeo, camera, planeGeo, scene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PAINT_W = 640, PAINT_H = 240;

export const paintStatus = {
  ready: false, serial: 0, ruleId: null, visual: 'graphic-arithmetic',
  pins: [], counts: [], difference: 0, invalidPins: [],
  coverage: 0, svgBytes: 0, error: '',
};

const svgNode = (name, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};

function appendRough(svg, node) {
  svg.appendChild(node);
  return node;
}

function makeHintSvg(puzzle) {
  if (!puzzle) throw new Error('門 1 圖形等差題尚未建立');
  const svg = svgNode('svg', {
    xmlns: SVG_NS, viewBox: `0 0 ${PAINT_W} ${PAINT_H}`,
    width: PAINT_W, height: PAINT_H,
  });
  const rc = rough.svg(svg);
  let seed = (puzzle.wallSeed % 0x7ffffffe) + 1;
  const option = (stroke, strokeWidth = 3, extra = {}) => ({
    stroke, strokeWidth, roughness: 1.65, bowing: 1.9, seed: seed++, ...extra,
  });
  const centres = [80, 240, 400, 560];
  const glyph = (pin, cx, cy, radius) => {
    const common = option('#171716', 5.2, { fill: GLYPH[pin].c, fillStyle: 'solid' });
    if (pin % 4 === 0) appendRough(svg, rc.circle(cx, cy, radius * 1.8, common));
    if (pin % 4 === 1) appendRough(svg, rc.rectangle(cx - radius * 0.82, cy - radius * 0.82,
      radius * 1.64, radius * 1.64, common));
    if (pin % 4 === 2) appendRough(svg, rc.polygon([
      [cx, cy - radius], [cx + radius * 0.92, cy + radius * 0.78],
      [cx - radius * 0.92, cy + radius * 0.78],
    ], common));
    if (pin % 4 === 3) appendRough(svg, rc.polygon([
      [cx, cy - radius], [cx + radius * 0.78, cy], [cx, cy + radius], [cx - radius * 0.78, cy],
    ], common));
  };
  const punchDots = (count, cx, cy) => {
    const gap = 24;
    for (let i = 0; i < count; i++) {
      const x = cx + (i - (count - 1) / 2) * gap;
      appendRough(svg, rc.circle(x, cy, 12, option('#211b18', 3.0, {
        fill: '#3b2822', fillStyle: 'solid', roughness: 1.3, bowing: 0.7,
      })));
      appendRough(svg, rc.circle(x + 1, cy - 1, 4.5, option('#a36c50', 1.0, {
        fill: '#a36c50', fillStyle: 'solid', roughness: 1.0, bowing: 0.4,
      })));
    }
  };

  // 同一個位置同時帶撞針身分與等差資料；辨認後可直接回鎖內操作。
  puzzle.clues.forEach((clue, index) => {
    glyph(clue.pin, centres[index], 76, 29);
    punchDots(clue.count, centres[index], 166);
  });
  return svg;
}

function distressCanvas(ctx, puzzle) {
  const rng = mulberry32((puzzle.wallSeed ^ 0x5f3759df) >>> 0);
  for (let i = 0; i < CFG.paint.drips; i++) {
    const x = 60 + rng() * (PAINT_W - 120), y = 190 + rng() * 18;
    const len = 18 + rng() * 48, width = 1.5 + rng() * 3;
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, '#6b211c90');
    g.addColorStop(1, '#6b211c00');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, width, len);
  }

  ctx.globalCompositeOperation = 'destination-out';
  const holes = PAINT_W * PAINT_H * CFG.paint.erosion / 115;
  for (let i = 0; i < holes; i++) {
    const x = rng() * PAINT_W, y = rng() * PAINT_H, radius = 0.7 + rng() * 3.2;
    ctx.globalAlpha = 0.24 + rng() * 0.50;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

export function makePaintTexture(puzzle) {
  const svg = makeHintSvg(puzzle);
  const xml = new XMLSerializer().serializeToString(svg);
  paintStatus.ruleId = puzzle.ruleId;
  paintStatus.pins = puzzle.clues.map(clue => clue.pin);
  paintStatus.counts = puzzle.clues.map(clue => clue.count);
  paintStatus.difference = puzzle.difference;
  paintStatus.invalidPins = [puzzle.falsePin];
  paintStatus.svgBytes = xml.length;

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const cv = document.createElement('canvas'); cv.width = PAINT_W; cv.height = PAINT_H;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, PAINT_W, PAINT_H);
      distressCanvas(ctx, puzzle);
      const data = ctx.getImageData(0, 0, PAINT_W, PAINT_H).data;
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 28) painted++;
      paintStatus.coverage = painted / (PAINT_W * PAINT_H);

      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      resolve(tex);
    };
    image.onerror = () => reject(new Error('SVG 圖形等差題無法轉成牆面 Canvas'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });
}

export const paintMat = new THREE.MeshStandardMaterial({
  transparent: true, roughness: 0.92, metalness: 0,
  color: 0xa0988d, emissive: 0x0b0705, emissiveIntensity: 0.05, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -1,
});
export const paintPlane = new THREE.Mesh(planeGeo, paintMat);
paintPlane.rotation.y = Math.PI / 2;
paintPlane.scale.set(CFG.paint.width, CFG.paint.height, 1);
paintPlane.position.set(-CFG.world.corridorW / 2 + 0.012, CFG.paint.baseY, CFG.paint.wallZ);
scene.add(paintPlane);

let paintSerial = 0;
export function repaint() {
  const serial = ++paintSerial;
  paintStatus.serial = serial;
  paintStatus.ready = false;
  paintStatus.error = '';
  makePaintTexture(R.puzzle).then(tex => {
    if (serial !== paintSerial) { tex.dispose(); return; }
    paintMat.map?.dispose();
    paintMat.map = tex;
    paintMat.needsUpdate = true;
    paintStatus.ready = true;
  }).catch(err => {
    if (serial !== paintSerial) return;
    paintStatus.error = err instanceof Error ? err.message : String(err);
    console.error('提示牆生成失敗', err);
  });
}

/* 題列旁只留故障光、隱去燈體，避免它被誤認成第五個圖形。 */
export const markerMat = new THREE.MeshBasicMaterial({ color: 0xd8b25a, transparent: true, opacity: 0 });
export const marker = new THREE.Mesh(boxGeo, markerMat);
marker.scale.set(0.018, 0.065, 0.015);
marker.position.set(-CFG.world.corridorW / 2 + 0.05, CFG.paint.baseY + 0.46, CFG.paint.wallZ - 0.72);
scene.add(marker);
export const markerLight = new THREE.PointLight(0xd8b25a, 0, 2.2, 1.8);
markerLight.position.copy(marker.position).x += 0.12;
scene.add(markerLight);

/* 開場序列與照明。 */
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

/* 暗角。 */
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
