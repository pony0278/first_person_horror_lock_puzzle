/* Door 3 black-face material separation.
 *
 * The legacy face texture was purely additive. Once the rectangular blackVoid
 * backdrop was removed, its bright eyes/teeth blended directly onto whatever
 * metal happened to sit behind the plane, making the threat read like artwork
 * printed on the floodgate.
 *
 * Keep the existing face mesh/timing, but replace its texture with an alpha-cut
 * head silhouette rendered with normal blending. The head interior is genuinely
 * black, the exterior remains transparent, and normal depth testing keeps it
 * physically behind the ruined gate rather than pasted over the fragments.
 */
import * as THREE from 'three';
import './door3-finale.js';
import { floodDoor } from './pumphub.js';

function separatedFaceTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Irregular oversized head silhouette. Outside this path alpha remains zero,
  // so there is no rectangular black card and no corridor-blocking plane read.
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.985)';
  ctx.beginPath();
  ctx.moveTo(256, 15);
  ctx.bezierCurveTo(122, 9, 54, 75, 48, 174);
  ctx.bezierCurveTo(43, 274, 118, 363, 250, 374);
  ctx.bezierCurveTo(378, 369, 470, 288, 466, 177);
  ctx.bezierCurveTo(462, 78, 392, 18, 256, 15);
  ctx.closePath();
  ctx.fill();

  // Subtle asymmetry prevents the silhouette from reading as a clean ellipse.
  ctx.fillStyle = 'rgba(0,0,0,0.97)';
  ctx.beginPath();
  ctx.ellipse(77, 190, 38, 82, -0.16, 0, Math.PI * 2);
  ctx.ellipse(437, 181, 34, 77, 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const drawEye = (x, y, rx, ry, fill, alpha, blur) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.shadowColor = fill;
    ctx.shadowBlur = blur;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // RGB ghosts stay inside the black head, so they read as facial corruption
  // rather than colour being added directly to the floodgate material.
  drawEye(155, 108, 38, 30, '#ff2b1d', 0.82, 18);
  drawEye(341, 104, 42, 32, '#ff2b1d', 0.82, 18);
  drawEye(171, 108, 38, 30, '#27d9ff', 0.84, 18);
  drawEye(357, 104, 42, 32, '#27d9ff', 0.84, 18);
  drawEye(163, 108, 34, 27, '#ffffff', 1, 22);
  drawEye(349, 104, 37, 28, '#ffffff', 1, 22);

  const toothCentres = Array.from({ length: 15 }, (_, i) => {
    const t = i / 14;
    const x = 92 + t * 328;
    const u = (t - 0.5) * 2;
    const y = 186 + (1 - u * u) * 90;
    const h = 27 + (1 - Math.abs(u)) * 29;
    const w = 13 + (1 - Math.abs(u)) * 7;
    return { x, y, h, w, lean: u * 0.08 };
  });

  const drawGrin = (dx, colour, alpha, blur = 0) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour;
    ctx.shadowColor = colour;
    ctx.shadowBlur = blur;
    for (const tooth of toothCentres) {
      ctx.save();
      ctx.translate(tooth.x + dx, tooth.y);
      ctx.rotate(tooth.lean);
      ctx.beginPath();
      ctx.moveTo(-tooth.w / 2, -6);
      ctx.quadraticCurveTo(0, -13, tooth.w / 2, -6);
      ctx.lineTo(tooth.w * 0.35, tooth.h);
      ctx.quadraticCurveTo(0, tooth.h + 8, -tooth.w * 0.35, tooth.h);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  drawGrin(-7, '#ff3020', 0.72, 11);
  drawGrin(7, '#22dfff', 0.74, 11);
  drawGrin(0, '#fffdf2', 1, 15);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

export function applyDoor3FaceSeparation() {
  const face = floodDoor.getObjectByName('door3-finale-black-face');
  const material = face?.material;
  if (!face || !material) return false;

  const oldMap = material.map;
  material.map = separatedFaceTexture();
  material.transparent = true;
  material.blending = THREE.NormalBlending;
  material.depthTest = true;
  material.depthWrite = true;
  material.alphaTest = 0.025;
  material.premultipliedAlpha = false;
  material.toneMapped = false;
  material.needsUpdate = true;

  // The old face map is unique to this mesh. Releasing it avoids keeping two
  // full CanvasTextures alive for the remainder of the run.
  oldMap?.dispose?.();
  return true;
}

applyDoor3FaceSeparation();
