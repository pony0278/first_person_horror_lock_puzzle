/* 門 1 的門上對照：四個撞針符號各自綁定 1～4 道刻痕。
   牆上只有分裂規律；玩家面向門操作時才取得這份資料。 */

import * as THREE from 'three';
import rough from 'roughjs/bundled/rough.esm.js';
import { GLYPH } from '../logic/glyphs.js';
import { R } from '../state.js';
import { LEAF_Z, doorLeaf, planeGeo } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAP_W = 960, MAP_H = 240;

export const doorClueStatus = {
  ready: false, serial: 0, coverage: 0, svgBytes: 0, error: '',
};

const svgNode = (name, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};
const appendRough = (svg, node) => { svg.appendChild(node); return node; };

function makeDoorSvg(puzzle) {
  if (!puzzle) throw new Error('門 1 門面對照尚未建立');
  const svg = svgNode('svg', {
    xmlns: SVG_NS, viewBox: `0 0 ${MAP_W} ${MAP_H}`,
    width: MAP_W, height: MAP_H,
  });
  const rc = rough.svg(svg);
  let seed = ((puzzle.wallSeed ^ 0x27d4eb2d) % 0x7ffffffe) + 1;
  const option = (stroke, strokeWidth = 3, extra = {}) => ({
    stroke, strokeWidth, roughness: 1.35, bowing: 1.4, seed: seed++, ...extra,
  });

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

  const xs = [120, 360, 600, 840];
  const yOffsets = [0, 8, -5, 4];
  puzzle.doorMarks.forEach(mark => {
    const x = xs[mark.pin], yOffset = yOffsets[mark.pin];
    glyph(mark.pin, x, 65 + yOffset, 27);
    const gap = 18;
    for (let i = 0; i < mark.count; i++) {
      const sx = x + (i - (mark.count - 1) / 2) * gap;
      appendRough(svg, rc.line(sx - 7, 203 + yOffset, sx + 8, 128 + yOffset,
        option('#493a2d', 8.2)));
      appendRough(svg, rc.line(sx - 4, 200 + yOffset, sx + 10, 130 + yOffset,
        option('#d3b681', 2.6)));
    }
  });

  // 門漆上的零星舊傷不承載資訊，避免四組對照像印刷表格。
  for (const [x, y, dx] of [[30, 92, 34], [215, 226, 45], [490, 20, 29], [712, 220, 38], [900, 94, 28]]) {
    appendRough(svg, rc.line(x, y, x + dx, y - 4, option('#4b4037', 1.1)));
  }
  return svg;
}

function textureFromSvg(puzzle) {
  const svg = makeDoorSvg(puzzle);
  const xml = new XMLSerializer().serializeToString(svg);
  doorClueStatus.svgBytes = xml.length;
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const cv = document.createElement('canvas'); cv.width = MAP_W; cv.height = MAP_H;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, MAP_W, MAP_H);
      const data = ctx.getImageData(0, 0, MAP_W, MAP_H).data;
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 28) painted++;
      doorClueStatus.coverage = painted / (MAP_W * MAP_H);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      resolve(tex);
    };
    image.onerror = () => reject(new Error('SVG 門面刻痕無法轉成 Canvas'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });
}

export const doorClueMat = new THREE.MeshStandardMaterial({
  transparent: true, roughness: 0.88, metalness: 0,
  color: 0xd0c8bd, emissive: 0x5e4933, emissiveIntensity: 0.24, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -2,
});
export const doorClue = new THREE.Mesh(planeGeo, doorClueMat);
doorClue.scale.set(1.22, 0.34, 1);
doorClue.position.set(0.22, 1.61, LEAF_Z + 0.018);
doorClue.renderOrder = 2;
doorClue.visible = false;
doorLeaf.add(doorClue);

let paintSerial = 0;
export function repaintDoorClue() {
  const serial = ++paintSerial;
  doorClueStatus.serial = serial;
  doorClueStatus.ready = false;
  doorClueStatus.error = '';
  textureFromSvg(R.puzzle).then(tex => {
    if (serial !== paintSerial) { tex.dispose(); return; }
    doorClueMat.map?.dispose();
    doorClueMat.map = tex;
    doorClueMat.emissiveMap = tex;
    doorClueMat.needsUpdate = true;
    doorClue.visible = true;
    doorClueStatus.ready = true;
  }).catch(err => {
    if (serial !== paintSerial) return;
    doorClueStatus.error = err instanceof Error ? err.message : String(err);
    console.error('門面刻痕生成失敗', err);
  });
}
