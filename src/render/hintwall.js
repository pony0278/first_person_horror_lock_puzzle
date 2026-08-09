/* 門 1 的缺格位置序列與後製。
   牆面只有三格：兩端是同款五點軌道，中間是一塊真的被拔走的牆皮。
   玩家補回標記位於中央的軌道後，完成的左到右順序就是撬鎖順序。 */

import * as THREE from 'three';
import rough from 'roughjs/bundled/rough.esm.js';
import { CFG } from '../logic/config.js';
import { DOOR1_GLYPHS } from '../logic/glyphs.js';
import { missingPuzzlePins } from '../logic/pin-puzzle.js';
import { mulberry32 } from '../logic/rng.js';
import { R } from '../state.js';
import { boxGeo, camera, planeGeo, scene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PAINT_W = 640, PAINT_H = 240;

export const paintStatus = {
  ready: false, serial: 0, ruleId: null, visual: 'missing-position-sequence',
  slots: [], pinMarks: [], missingIndex: -1, missingPins: [], step: 0,
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
  if (!puzzle) throw new Error('門 1 缺格圖形序列尚未建立');
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
  const markerRail = (mark, cx, cy) => {
    const glyph = DOOR1_GLYPHS[mark];
    const span = 50, gap = span / 2;
    appendRough(svg, rc.rectangle(cx - 61, cy - 36, 122, 72,
      option('#514b46', 3.1, { roughness: 1.9, bowing: 2.0 })));
    appendRough(svg, rc.line(cx - span, cy, cx + span, cy,
      option('#403b37', 3.1, { roughness: 1.5, bowing: 1.4 })));
    for (let position = -2; position <= 2; position++) {
      appendRough(svg, rc.circle(cx + position * gap, cy, 10, option('#332e2a', 2.0, {
        fill: '#514943', fillStyle: 'solid', roughness: 1.1, bowing: 0.6,
      })));
    }
    appendRough(svg, rc.circle(cx + glyph.position * gap, cy, 31, option('#171716', 4.0, {
      fill: glyph.c, fillStyle: 'solid', roughness: 1.35, bowing: 0.9,
    })));
  };  const nailHole = (cx, cy) => {
    appendRough(svg, rc.circle(cx, cy, 11, option('#312c28', 2.6, {
      fill: '#443d37', fillStyle: 'solid', roughness: 1.2, bowing: 0.7,
    })));
    appendRough(svg, rc.circle(cx + 1, cy - 1, 3.5, option('#a29888', 0.8, {
      fill: '#a29888', fillStyle: 'solid', roughness: 0.8, bowing: 0.4,
    })));
  };
  const missingSlot = (cx, cy) => {
    // 空缺與兩端軌道同尺寸；中央保持透明，只留被拔走後的不對稱剝落邊。
    const scars = [
      [[cx - 62, cy - 38], [cx + 44, cy - 41], [cx + 62, cy - 31],
       [cx + 19, cy - 27], [cx - 51, cy - 29]],
      [[cx - 64, cy - 34], [cx - 55, cy - 23], [cx - 56, cy + 21],
       [cx - 65, cy + 37], [cx - 70, cy + 4]],
      [[cx + 55, cy - 29], [cx + 65, cy - 19], [cx + 63, cy + 8],
       [cx + 56, cy + 30], [cx + 50, cy + 15]],
      [[cx - 54, cy + 27], [cx - 12, cy + 31], [cx + 54, cy + 25],
       [cx + 43, cy + 39], [cx - 43, cy + 40]],
    ];
    scars.forEach(points => appendRough(svg, rc.polygon(points, option('#655c53', 2.8, {
      fill: '#91877a', fillStyle: 'hachure', hachureGap: 6, hachureAngle: -22,
      roughness: 2.2, bowing: 2.5,
    }))));
    nailHole(cx - 53, cy - 27);
    nailHole(cx + 53, cy - 27);
    nailHole(cx - 53, cy + 27);
    nailHole(cx + 53, cy + 27);
    appendRough(svg, rc.polygon([
      [cx + 55, cy + 8], [cx + 70, cy + 17], [cx + 61, cy + 38], [cx + 53, cy + 27],
    ], option('#514a43', 2.4, {
      fill: '#766d63', fillStyle: 'solid', roughness: 2.0, bowing: 2.0,
    })));
  };

  // 同一道斷裂刮痕把三個位置串成一個序列，不使用箭頭或問號。
  appendRough(svg, rc.line(160, 112, 242, 112,
    option('#6b211c', 4.0, { roughness: 2.1, bowing: 2.7 })));
  appendRough(svg, rc.line(398, 112, 480, 112,
    option('#6b211c', 4.0, { roughness: 2.1, bowing: 2.7 })));

  puzzle.clues.forEach((clue, index) => {
    if (clue.missing) missingSlot(centres[index], 104);
    else markerRail(clue.mark, centres[index], 104);
  });
  return svg;
}

function distressCanvas(ctx, puzzle) {
  const rng = mulberry32((puzzle.wallSeed ^ 0x5f3759df) >>> 0);
  for (let i = 0; i < CFG.paint.drips; i++) {
    const x = 60 + rng() * (PAINT_W - 120), y = 180 + rng() * 18;
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
  paintStatus.slots = puzzle.clues.map(clue => clue.mark);
  paintStatus.pinMarks = [...puzzle.pinMarks];
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
    image.onerror = () => reject(new Error('SVG 缺格位置序列無法轉成牆面 Canvas'));
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