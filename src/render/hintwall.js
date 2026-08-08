/* 提示牆與後製：規則推理筆記、指示燈、手電筒、補光、暗角。
   牆只教共同規則與閱讀方向，不直接標出假針或答案；抵達門前後仍能回頭重看。 */

import * as THREE from 'three';
import rough from 'roughjs/bundled/rough.esm.js';
import { CFG } from '../logic/config.js';
import { GLYPH } from '../logic/glyphs.js';
import { mulberry32 } from '../logic/rng.js';
import { R } from '../state.js';
import { boxGeo, camera, planeGeo, scene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PAINT_W = 768, PAINT_H = 480;

export const paintStatus = {
  ready: false, serial: 0, ruleId: null, coverage: 0, svgBytes: 0, error: '',
};

const svgNode = (name, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};

function addScratchText(svg, text, x, y, size, color, rotation = 0, anchor = 'start') {
  const make = (dx, dy, opacity) => {
    const node = svgNode('text', {
      x: x + dx, y: y + dy, fill: color, stroke: color, 'stroke-width': 0.45,
      'paint-order': 'stroke', opacity, 'font-size': size, 'font-weight': 700,
      'font-family': 'Segoe Print, Bradley Hand, Comic Sans MS, cursive',
      'text-anchor': anchor, 'dominant-baseline': 'middle',
      transform: `rotate(${rotation} ${x} ${y})`,
    });
    node.textContent = text;
    svg.appendChild(node);
  };
  make(1.1, -0.7, 0.22);
  make(0, 0, 0.92);
}

function appendRough(svg, node) {
  svg.appendChild(node);
  return node;
}

function makeHintSvg(puzzle) {
  if (!puzzle) throw new Error('門 1 規則題尚未建立');
  const svg = svgNode('svg', {
    xmlns: SVG_NS, viewBox: `0 0 ${PAINT_W} ${PAINT_H}`,
    width: PAINT_W, height: PAINT_H,
  });
  const rc = rough.svg(svg);
  const layout = mulberry32(puzzle.wallSeed || 1);
  let seed = (puzzle.wallSeed % 0x7ffffffe) + 1;
  const opt = (stroke, strokeWidth = 3, extra = {}) => ({
    stroke, strokeWidth, roughness: 1.45, bowing: 1.7, seed: seed++, ...extra,
  });
  const jitter = amount => (layout() - 0.5) * amount;
  const ink = '#58482c', ghost = '#3f3a30';
  const darken = (hex, factor) => {
    const n = Number.parseInt(hex.slice(1), 16);
    const c = shift => Math.round(((n >> shift) & 255) * factor).toString(16).padStart(2, '0');
    return '#' + c(16) + c(8) + c(0);
  };

  const arrow = (x0, y0, x1, y1, color = ghost, width = 2.4) => {
    appendRough(svg, rc.line(x0, y0, x1, y1, opt(color, width)));
    const ang = Math.atan2(y1 - y0, x1 - x0), head = 10;
    appendRough(svg, rc.line(x1, y1, x1 - Math.cos(ang - 0.55) * head,
      y1 - Math.sin(ang - 0.55) * head, opt(color, width)));
    appendRough(svg, rc.line(x1, y1, x1 - Math.cos(ang + 0.55) * head,
      y1 - Math.sin(ang + 0.55) * head, opt(color, width)));
  };

  const formula = (row, cx, y, size, color, rotation = 0) => {
    const left = row.terms.join(' · ');
    const leftW = Math.max(42, left.length * size * 0.53);
    const totalW = leftW + 52 + String(row.result).length * size * 0.55;
    const x = cx - totalW / 2;
    addScratchText(svg, left, x, y, size, color, rotation);
    arrow(x + leftW + 5, y + jitter(4), x + leftW + 35, y + jitter(4), color, Math.max(1.5, size * 0.075));
    addScratchText(svg, String(row.result), x + leftW + 45, y, size * 1.06, color, rotation);
  };

  const glyph = (pin, cx, cy, radius) => {
    const color = GLYPH[pin].c;
    const common = opt('#302a24', 5, { fill: color, fillStyle: 'solid' });
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

  // 上方兩個片段像前人反覆驗算的痕跡，不使用題號、表格或問號。
  formula(puzzle.examples[0], 205 + jitter(18), 88 + jitter(16), 42, ink, jitter(5));
  formula(puzzle.examples[1], 538 + jitter(18), 126 + jitter(16), 38, ink, jitter(5));
  appendRough(svg, rc.path('M 92 151 C 220 178, 434 188, 664 158',
    opt(ghost, 2.2, { strokeLineDash: [9, 10] })));
  appendRough(svg, rc.path('M 300 50 C 352 22, 426 28, 472 62', opt(ghost, 1.8)));
  arrow(468, 62, 493, 82, ghost, 1.8);

  // 四個線索的物理順序就是撬鎖順序；玩家只需識破並跳過違規的那一個。
  const xs = [94, 288, 482, 676];
  const ys = [286, 323, 280, 318];
  puzzle.clues.forEach((row, i) => {
    const x = xs[i] + jitter(12), y = ys[i] + jitter(14);
    glyph(row.pin, x, y, 28);
    formula(row, x, y + 67, 27, darken(GLYPH[row.pin].c, 0.58), jitter(5));
    if (i < puzzle.clues.length - 1) {
      const nx = xs[i + 1], ny = ys[i + 1];
      appendRough(svg, rc.path(`M ${x + 38} ${y - 4} C ${x + 86} ${y - 35}, ${nx - 72} ${ny - 35}, ${nx - 38} ${ny - 4}`,
        opt(ghost, 2.3, { strokeLineDash: [7, 8] })));
      arrow(nx - 47, ny - 8, nx - 31, ny - 1, ghost, 2.0);
    }
  });

  // 邊角的無意義短劃與重描，破壞「考卷」般的整齊感，但不承載答案。
  for (let i = 0; i < 11; i++) {
    const x = 24 + layout() * (PAINT_W - 48), y = 28 + layout() * (PAINT_H - 56);
    appendRough(svg, rc.line(x, y, x + 8 + layout() * 24, y + jitter(12),
      opt('#38342d', 1.1 + layout())));
  }
  return svg;
}

function distressCanvas(ctx, puzzle) {
  const rng = mulberry32((puzzle.wallSeed ^ 0x5f3759df) >>> 0);
  const P = CFG.paint;
  const colors = puzzle.clues.map(row => GLYPH[row.pin].c);

  for (let i = 0; i < P.drips; i++) {
    const x = 45 + rng() * (PAINT_W - 90), y = 290 + rng() * 90;
    const len = 28 + rng() * 90, width = 2 + rng() * 4;
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    const color = colors[i % colors.length];
    g.addColorStop(0, color + 'b8');
    g.addColorStop(1, color + '00');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, width, len);
  }

  ctx.globalCompositeOperation = 'destination-out';
  const holes = PAINT_W * PAINT_H * P.erosion / 115;
  for (let i = 0; i < holes; i++) {
    const x = rng() * PAINT_W, y = rng() * PAINT_H, radius = 0.8 + rng() * 4.2;
    ctx.globalAlpha = 0.28 + rng() * 0.58;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

export function makePaintTexture(puzzle) {
  const svg = makeHintSvg(puzzle);
  const xml = new XMLSerializer().serializeToString(svg);
  paintStatus.ruleId = puzzle.ruleId;
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
    image.onerror = () => reject(new Error('SVG 規則筆記無法轉成牆面 Canvas'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });
}
export const paintMat = new THREE.MeshStandardMaterial({
  transparent: true, roughness: 0.9, metalness: 0,
  color: 0x8a8a8a, emissive: 0x0c0907, emissiveIntensity: 0.08, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -1,
});
export const paintPlane = new THREE.Mesh(planeGeo, paintMat);
paintPlane.rotation.y = Math.PI / 2;          // 左牆 (x = -W/2)，面朝走廊內
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
