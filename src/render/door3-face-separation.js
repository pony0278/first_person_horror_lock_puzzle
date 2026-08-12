/* Door 3 black-face image material.
 *
 * The threat now uses the authored image asset supplied for the finale instead
 * of drawing eyes/teeth procedurally on a CanvasTexture. Threat Isolation still
 * owns the blackout timing/layer switch; this module only controls how the face
 * itself is rendered.
 */
import * as THREE from 'three';
import './door3-finale.js';
import { floodDoor } from './pumphub.js';

const FACE_IMAGE_URL = new URL('../assets/door3-black-face.webp', import.meta.url).href;

/* The source image is square and intentionally has a deep-black background.
 * Before the threat-only camera layer fully engages, a soft elliptical alpha
 * mask prevents that background from reading as a rectangular card in the
 * ruined doorway. Dark eye sockets remain opaque because the mask is spatial,
 * not luminance-derived.
 */
function headAlphaMaskTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 512, 512);

  ctx.save();
  ctx.translate(256, 254);
  ctx.scale(0.90, 1.08);
  const gradient = ctx.createRadialGradient(0, -18, 82, 0, -8, 252);
  gradient.addColorStop(0, '#fff');
  gradient.addColorStop(0.69, '#fff');
  gradient.addColorStop(0.84, '#d6d6d6');
  gradient.addColorStop(0.94, '#707070');
  gradient.addColorStop(1, '#000');
  ctx.fillStyle = gradient;
  ctx.fillRect(-300, -300, 600, 600);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.name = 'door3-black-face-alpha-mask';
  return texture;
}

function loadAuthoredFaceTexture(material) {
  const fallbackMap = material.map;
  const loader = new THREE.TextureLoader();
  loader.load(
    FACE_IMAGE_URL,
    texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.name = 'door3-black-face-image';
      material.map = texture;
      material.needsUpdate = true;
      fallbackMap?.dispose?.();
    },
    undefined,
    () => {
      // Keep the legacy texture as a safe fallback if asset loading ever fails.
    },
  );
}

export function applyDoor3FaceSeparation() {
  const face = floodDoor.getObjectByName('door3-finale-black-face');
  const material = face?.material;
  if (!face || !material) return false;

  // The supplied art is 1:1. Replacing the old 3.35:2.52 plane prevents the
  // skull from being stretched horizontally while keeping it oversized.
  face.geometry?.dispose?.();
  face.geometry = new THREE.PlaneGeometry(3.10, 3.10);

  material.alphaMap?.dispose?.();
  material.alphaMap = headAlphaMaskTexture();
  material.color.setHex(0xffffff);
  material.transparent = true;
  material.blending = THREE.NormalBlending;
  material.depthTest = true;
  material.depthWrite = true;
  material.alphaTest = 0.018;
  material.premultipliedAlpha = false;
  material.fog = false;
  material.toneMapped = false;
  material.needsUpdate = true;

  loadAuthoredFaceTexture(material);
  return true;
}

applyDoor3FaceSeparation();
