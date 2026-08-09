/* 門 1 的牆上規律與後製。
   四個等距位置依序留下 1、2、遭抹除、4 道刻痕。玩家一眼知道要數與補缺，
   撞針映射仍留在門上；回頭時後方走廊維持在畫面中央。 */

import * as THREE from 'three';
import rough from 'roughjs/bundled/rough.esm.js';
import { CFG } from '../logic/config.js';
import { mulberry32 } from '../logic/rng.js';
import { R } from '../state.js';
import { boxGeo, camera, planeGeo, scene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PAINT_W = 640, PAINT_H = 240;

export const paintStatus = {
  ready: false, serial: 0, ruleId: null, visual: 'erased-tally-sequence',
  sequenceCounts: [1, 2, null, 4], erasedCount: 3,
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
  if (!puzzle) throw new Error('門 1 分裂規律尚未建立');
  const svg = svgNode('svg', {
    xmlns: SVG_NS, viewBox: `0 0 ${PAINT_W} ${PAINT_H}`,
    width: PAINT_W, height: PAINT_H,
  });
  const rc = rough.svg(svg);
  let seed = (puzzle.wallSeed % 0x7ffffffe) + 1;
  const option = (stroke, strokeWidth = 3, extra = {}) => ({
    stroke, strokeWidth, roughness: 1.65, bowing: 1.9, seed: seed++, ...extra,
  });
  const ink = '#241e1a', rust = '#6b2b23';

  // 四個位置等距排列；題型一眼就是「1、2、缺、4」，不需要先猜圖像語法。
  const tally = (count, cx, outer = ink, inner = rust) => {
    const gap = 23;
    for (let i = 0; i < count; i++) {
      const x = cx + (i - (count - 1) / 2) * gap;
      const lean = i % 2 ? 5 : -3;
      appendRough(svg, rc.line(x - 8, 174, x + 8 + lean, 66,
        option(outer, 9.2, { roughness: 1.15, bowing: 0.65 })));
      appendRough(svg, rc.line(x - 4, 170, x + 11 + lean, 70,
        option(inner, 2.5, { roughness: 1.05, bowing: 0.45 })));
    }
  };
  const centres = [92, 242, 392, 542];
  const erasedIndex = puzzle.wallSequence.findIndex(count => count === null);
  if (erasedIndex < 0) throw new Error('門 1 牆面序列缺少抹除位置');
  puzzle.wallSequence.forEach((count, index) => {
    if (count !== null) tally(count, centres[index]);
  });
  tally(puzzle.erasedCount, centres[erasedIndex], '#332923', '#512823');

  // 第三位原本有刻痕，但被焦黑污漬與一道猛烈刮除線破壞；上下殘端仍可辨認。
  appendRough(svg, rc.polygon([
    [338, 93], [355, 77], [385, 83], [407, 74], [438, 92],
    [431, 113], [446, 132], [428, 158], [397, 153], [372, 162],
    [342, 148], [348, 125], [331, 110],
  ], option('#171310', 3.2, {
    fill: '#171310', fillStyle: 'solid', roughness: 2.1, bowing: 1.2,
  })));
  appendRough(svg, rc.path('M 344 166 L 438 78',
    option('#0f0c0b', 12.5, { roughness: 1.35, bowing: 0.7 })));
  appendRough(svg, rc.path('M 347 163 L 435 81',
    option('#6b2b23', 3.0, { roughness: 1.1, bowing: 0.5 })));
  return svg;
}

function distressCanvas(ctx, puzzle) {
  const rng = mulberry32((puzzle.wallSeed ^ 0x5f3759df) >>> 0);
  for (let i = 0; i < CFG.paint.drips; i++) {
    const x = 80 + rng() * (PAINT_W - 160), y = 122 + rng() * 38;
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
  paintStatus.sequenceCounts = [...puzzle.wallSequence];
  paintStatus.erasedCount = puzzle.erasedCount;
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
    image.onerror = () => reject(new Error('SVG 分裂規律無法轉成牆面 Canvas'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });
}

export const paintMat = new THREE.MeshStandardMaterial({
  transparent: true, roughness: 0.92, metalness: 0,
  color: 0x77736b, emissive: 0x080605, emissiveIntensity: 0.04, depthWrite: false,
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

/* 規律旁的故障指示燈只負責讓玩家掃到牆面，不把視線鎖住。 */
export const markerMat = new THREE.MeshBasicMaterial({ color: 0xd8b25a });
export const marker = new THREE.Mesh(boxGeo, markerMat);
marker.scale.set(0.05, 0.05, 0.03);
marker.position.set(-CFG.world.corridorW / 2 + 0.05, CFG.paint.baseY + 0.34, CFG.paint.wallZ);
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
