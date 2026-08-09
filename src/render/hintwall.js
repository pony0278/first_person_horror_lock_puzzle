/* 門 1 的符號＋點數缺格序列與後製。
   牆面只有三格：符號在上、點數在下，中央整格被一塊陳年髒污遮掉。
   玩家由兩端點數補回等差中項，再以鎖面上相同的符號＋點數完成撬鎖順序。 */

import * as THREE from 'three';
import rough from 'roughjs/bundled/rough.esm.js';
import { CFG } from '../logic/config.js';
import { GLYPH } from '../logic/glyphs.js';
import { missingPuzzlePins } from '../logic/pin-puzzle.js';
import { mulberry32 } from '../logic/rng.js';
import { R } from '../state.js';
import { boxGeo, camera, planeGeo, scene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PAINT_W = 640, PAINT_H = 240;

export const paintStatus = {
  ready: false, serial: 0, ruleId: null, visual: 'missing-dot-sequence',
  pins: [], counts: [], pinCounts: [], missingIndex: -1, missingPins: [], step: 0,
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
  if (!puzzle) throw new Error('門 1 符號＋點數缺格序列尚未建立');
  const svg = svgNode('svg', {
    xmlns: SVG_NS, viewBox: `0 0 ${PAINT_W} ${PAINT_H}`,
    width: PAINT_W, height: PAINT_H,
  });
  const rc = rough.svg(svg);
  let seed = (puzzle.wallSeed % 0x7ffffffe) + 1;
  const option = (stroke, strokeWidth = 3, extra = {}) => ({
    stroke, strokeWidth, roughness: 1.65, bowing: 1.9, seed: seed++, ...extra,
  });
  const centres = [108, 320, 532];

  const stationScars = cx => {
    // 三個位置只用短角痕標示欄位，不畫完整考卷格線。
    const y0 = 28, y1 = 203, x0 = cx - 66, x1 = cx + 66, arm = 18;
    [[x0, y0, x0 + arm, y0], [x1 - arm, y0, x1, y0],
     [x0, y1, x0 + arm, y1], [x1 - arm, y1, x1, y1]].forEach(([ax, ay, bx, by]) =>
      appendRough(svg, rc.line(ax, ay, bx, by, option('#5b5149', 2.2, { roughness: 2.2 }))));
  };

  const symbolMark = (pin, cx, cy) => {
    const glyph = GLYPH[pin];
    const common = option('#241f1c', 4.2, {
      fill: glyph.c, fillStyle: 'solid', roughness: 1.55, bowing: 1.0,
    });
    if (pin === 0) appendRough(svg, rc.circle(cx, cy, 62, common));
    else if (pin === 1) appendRough(svg, rc.rectangle(cx - 29, cy - 29, 58, 58, common));
    else if (pin === 2) appendRough(svg, rc.polygon([
      [cx, cy - 34], [cx + 34, cy + 28], [cx - 34, cy + 28],
    ], common));
    else appendRough(svg, rc.polygon([
      [cx, cy - 36], [cx + 35, cy], [cx, cy + 36], [cx - 35, cy],
    ], common));
  };

  const punchDots = (count, cx, cy) => {
    const gap = 21;
    for (let index = 0; index < count; index++) {
      const x = cx + (index - (count - 1) / 2) * gap;
      appendRough(svg, rc.circle(x, cy, 13, option('#211d1a', 2.5, {
        fill: '#2a2521', fillStyle: 'solid', roughness: 1.1, bowing: 0.6,
      })));
      appendRough(svg, rc.circle(x - 1, cy - 1, 3.2, option('#aca08d', 0.7, {
        fill: '#aca08d', fillStyle: 'solid', roughness: 0.7, bowing: 0.3,
      })));
    }
  };

  const missingSlot = (cx, cy) => {
    // 多層不對稱污漬蓋住整個符號＋點數；沒有封閉邊框，避免看成規整挖空格。
    const stainRng = mulberry32((puzzle.wallSeed ^ 0xc6bc2796) >>> 0);
    const blob = (x, y, rx, ry, count, phase, color, opacity) => {
      const points = Array.from({ length: count }, (_, index) => {
        const angle = phase + (Math.PI * 2 * index) / count;
        const wobble = 0.72 + stainRng() * 0.42;
        return [
          x + Math.cos(angle) * rx * wobble + (stainRng() - 0.5) * 7,
          y + Math.sin(angle) * ry * wobble + (stainRng() - 0.5) * 9,
        ];
      });
      const mark = rc.polygon(points, option(color, 1.25, {
        fill: color, fillStyle: 'solid', roughness: 2.8, bowing: 2.2,
      }));
      mark.setAttribute('opacity', String(opacity));
      appendRough(svg, mark);
    };

    // 外圈淡、內側沉積較深；偏移的小污塊與下垂痕打破任何矩形聯想。
    blob(cx - 2, cy + 1, 77, 92, 17, 0.08, '#62584d', 0.30);
    blob(cx - 9, cy - 4, 61, 78, 15, 0.29, '#443b32', 0.54);
    blob(cx + 4, cy + 5, 43, 62, 13, 0.47, '#2f2923', 0.66);
    blob(cx + 55, cy - 31, 27, 34, 11, 0.14, '#574d43', 0.24);
    blob(cx - 53, cy + 46, 23, 29, 10, 0.36, '#51473d', 0.22);

    const drip = rc.line(cx + 27, cy + 51, cx + 22, cy + 101,
      option('#3b322a', 6.2, { roughness: 3.1, bowing: 3.8 }));
    drip.setAttribute('opacity', '0.34');
    appendRough(svg, drip);

    // 幾道較淺的擦痕讓表面仍像髒污，而不是一塊實心黑色圖形。
    [[-39, -48, 8, -55], [-47, 2, 32, -8], [-29, 47, 24, 53]].forEach(
      ([x0, y0, x1, y1]) => {
        const wipe = rc.line(cx + x0, cy + y0, cx + x1, cy + y1,
          option('#81766a', 2.4, { roughness: 2.7, bowing: 3.2 }));
        wipe.setAttribute('opacity', '0.46');
        appendRough(svg, wipe);
      });
  };

  // 斷裂的暗紅刮痕把三格視為同一排，但不使用箭頭、文字或問號。
  appendRough(svg, rc.line(176, 114, 235, 114,
    option('#6b211c', 3.6, { roughness: 2.2, bowing: 2.7 })));
  appendRough(svg, rc.line(405, 114, 464, 114,
    option('#6b211c', 3.6, { roughness: 2.2, bowing: 2.7 })));

  puzzle.clues.forEach((clue, index) => {
    const cx = centres[index];
    stationScars(cx);
    if (clue.missing) missingSlot(cx, 115);
    else {
      symbolMark(clue.pin, cx, 82);
      punchDots(clue.count, cx, 163);
    }
  });
  return svg;
}

function distressCanvas(ctx, puzzle) {
  const rng = mulberry32((puzzle.wallSeed ^ 0x5f3759df) >>> 0);
  for (let i = 0; i < CFG.paint.drips; i++) {
    const x = 60 + rng() * (PAINT_W - 120), y = 194 + rng() * 10;
    const len = 14 + rng() * 38, width = 1.5 + rng() * 3;
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
  paintStatus.pinCounts = [...puzzle.pinCounts];
  paintStatus.missingIndex = puzzle.missingIndex;
  paintStatus.missingPins = missingPuzzlePins(puzzle);
  paintStatus.step = puzzle.step;
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
    image.onerror = () => reject(new Error('SVG 符號＋點數缺格序列無法轉成牆面 Canvas'));
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

/* 題列旁只留故障光、隱去燈體，避免它被誤認成額外圖形。 */
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