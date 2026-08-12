/* F2.5R.6 — lightweight Backrooms Level 0 cliffhanger.
 *
 * This intentionally borrows only the supplied demo's visual language: muted
 * yellow patterned wallpaper, dirty ochre carpet, tiled ceiling, fluorescent
 * fixtures, and short yellow fog. It does NOT import the demo's collision,
 * PointerLockControls, RectAreaLight grid, or EffectComposer / UnrealBloomPass.
 *
 * The whole tableau lives on a dedicated camera layer and is rendered for only
 * a couple of seconds after the Door 3 noclip blackout.
 */
import * as THREE from 'three';
import { DOOR3_LEVEL0_FINALE } from '../logic/door3-level0-finale.js';
import { camera, renderer, scene } from './scene.js';

const LAYER = DOOR3_LEVEL0_FINALE.layer;
const TEX_SIZE = DOOR3_LEVEL0_FINALE.textureSize;
const CEIL = 2.55;
const WORLD = 18;

const root = new THREE.Group();
root.name = 'door3-level0-root';
root.visible = false;
scene.add(root);

const seededNoise = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
};

function canvasTexture(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX_SIZE;
  const context = canvas.getContext('2d');
  draw(context, TEX_SIZE);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

const wallpaper = canvasTexture((ctx, size) => {
  ctx.fillStyle = '#c0b052';
  ctx.fillRect(0, 0, size, size);
  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const noise = (seededNoise(x * 0.13, y * 0.13) - 0.5) * 16 +
        (seededNoise(x * 0.027, y * 0.027) - 0.5) * 9;
      data[index] = Math.max(0, Math.min(255, data[index] + noise));
      data[index + 1] = Math.max(0, Math.min(255, data[index + 1] + noise));
      data[index + 2] = Math.max(0, Math.min(255, data[index + 2] + noise * 0.62));
    }
  }
  ctx.putImageData(image, 0, 0);

  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = '#766e2f';
  ctx.lineWidth = 3;
  const step = 32;
  for (let yy = -step; yy < size + step; yy += step) {
    for (let xx = -step; xx < size + step; xx += step) {
      const offset = ((yy / step) & 1) ? step / 2 : 0;
      const x = xx + offset;
      ctx.beginPath();
      ctx.moveTo(x, yy + 4);
      ctx.lineTo(x + 7, yy + 11);
      ctx.lineTo(x + 7, yy + 22);
      ctx.lineTo(x + 12, yy + 28);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
});
wallpaper.repeat.set(2.1, 1.1);

const carpet = canvasTexture((ctx, size) => {
  ctx.fillStyle = '#a58f49';
  ctx.fillRect(0, 0, size, size);
  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const fibre = (seededNoise(x * 0.73 + 17, y * 0.91 + 3) - 0.5) * 20;
      const stain = (seededNoise(x * 0.035, y * 0.035) - 0.5) * 12;
      data[index] = Math.max(0, Math.min(255, data[index] + fibre + stain));
      data[index + 1] = Math.max(0, Math.min(255, data[index + 1] + fibre * 0.72 + stain * 0.55));
      data[index + 2] = Math.max(0, Math.min(255, data[index + 2] + fibre * 0.20));
    }
  }
  ctx.putImageData(image, 0, 0);
  ctx.globalAlpha = 0.09;
  ctx.strokeStyle = '#4f431d';
  for (let y = 0; y < size; y += 3) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
});
carpet.repeat.set(9, 9);

const ceiling = canvasTexture((ctx, size) => {
  ctx.fillStyle = '#c3b568';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(73,64,28,.56)';
  ctx.lineWidth = 3;
  const step = size / 4;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
  }
  ctx.globalAlpha = 0.10;
  for (let i = 0; i < 260; i++) {
    const x = seededNoise(i, 1) * size;
    const y = seededNoise(i, 2) * size;
    ctx.fillStyle = i & 1 ? '#fff5c0' : '#665d27';
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
});
ceiling.repeat.set(6, 6);

const wallMat = new THREE.MeshStandardMaterial({
  map: wallpaper,
  roughness: 0.94,
  metalness: 0,
});
const carpetMat = new THREE.MeshStandardMaterial({
  map: carpet,
  roughness: 1,
  metalness: 0,
});
const ceilingMat = new THREE.MeshStandardMaterial({
  map: ceiling,
  roughness: 0.96,
  metalness: 0,
  side: THREE.DoubleSide,
});
const frameMat = new THREE.MeshStandardMaterial({
  color: 0xc8c19a,
  roughness: 0.86,
  metalness: 0.04,
});
const panelMat = new THREE.MeshBasicMaterial({
  color: 0xfff3c6,
  toneMapped: false,
});

const floor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD), carpetMat);
floor.name = 'door3-level0-floor';
floor.rotation.x = -Math.PI / 2;
root.add(floor);

const ceilingMesh = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD), ceilingMat);
ceilingMesh.name = 'door3-level0-ceiling';
ceilingMesh.rotation.x = Math.PI / 2;
ceilingMesh.position.y = CEIL;
root.add(ceilingMesh);

// 12 partitions + 4 square pillars = 16 wall instances total.
const wallDefs = [
  [-4.0, -2.0, 0.18, 12.0], [4.0, -2.0, 0.18, 12.0],
  [-2.25, -8.0, 3.5, 0.18], [2.75, -8.0, 2.5, 0.18],
  [-1.15, -4.7, 0.18, 4.6], [2.15, -5.8, 0.18, 3.6],
  [-2.55, 3.0, 2.9, 0.18], [2.45, 3.45, 3.1, 0.18],
  [-4.7, 6.0, 0.18, 4.0], [4.7, 6.0, 0.18, 4.0],
  [-2.1, 7.8, 3.9, 0.18], [2.75, 7.25, 3.0, 0.18],
  [-2.6, -1.7, 1.10, 1.10], [2.55, -0.8, 1.15, 1.15],
  [-2.75, 5.15, 1.05, 1.05], [1.45, 5.85, 1.12, 1.12],
];
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const walls = new THREE.InstancedMesh(unitBox, wallMat, wallDefs.length);
walls.name = 'door3-level0-walls';
walls.frustumCulled = false;
const transform = new THREE.Object3D();
wallDefs.forEach(([x, z, width, depth], index) => {
  transform.position.set(x, CEIL / 2, z);
  transform.scale.set(width, CEIL, depth);
  transform.rotation.set(0, 0, 0);
  transform.updateMatrix();
  walls.setMatrixAt(index, transform.matrix);
});
walls.instanceMatrix.needsUpdate = true;
root.add(walls);

const fixtureDefs = [
  [-1.9, -0.7, 0], [1.7, -2.8, Math.PI / 2],
  [-0.2, -5.6, 0], [2.25, -7.0, Math.PI / 2],
  [-2.4, 3.5, 0], [1.65, 5.45, Math.PI / 2],
  [0.1, 1.3, Math.PI / 2], [-0.9, 7.0, 0],
];
const fixtureFrame = new THREE.InstancedMesh(unitBox, frameMat, fixtureDefs.length);
fixtureFrame.name = 'door3-level0-fixture-frames';
fixtureFrame.frustumCulled = false;
const fixturePanel = new THREE.InstancedMesh(unitBox, panelMat, fixtureDefs.length);
fixturePanel.name = 'door3-level0-fixture-panels';
fixturePanel.frustumCulled = false;
fixtureDefs.forEach(([x, z, rotation], index) => {
  transform.position.set(x, CEIL - 0.045, z);
  transform.rotation.set(0, rotation, 0);
  transform.scale.set(1.32, 0.07, 0.68);
  transform.updateMatrix();
  fixtureFrame.setMatrixAt(index, transform.matrix);

  transform.position.y = CEIL - 0.092;
  transform.scale.set(1.16, 0.024, 0.52);
  transform.updateMatrix();
  fixturePanel.setMatrixAt(index, transform.matrix);
});
fixtureFrame.instanceMatrix.needsUpdate = true;
fixturePanel.instanceMatrix.needsUpdate = true;
root.add(fixtureFrame, fixturePanel);

const ambient = new THREE.HemisphereLight(0xfff6c4, 0x4f4725, 0.56);
ambient.name = 'door3-level0-ambient';
root.add(ambient);
for (const [index, x, z, intensity] of [
  [0, -0.5, -1.8, 10.5],
  [1, 0.8, -6.0, 8.0],
]) {
  const light = new THREE.PointLight(0xffefc4, intensity, 8.5, 1.65);
  light.name = `door3-level0-light-${index}`;
  light.position.set(x, CEIL - 0.32, z);
  root.add(light);
}

// Every renderable/light in this subtree must match the dedicated camera layer.
root.traverse(object => object.layers.set(LAYER));

const levelBackground = new THREE.Color(0xb8a75c);
const levelFog = new THREE.Fog(0xb6a65a, 4.6, 17.5);
let active = false;
let started = false;
let time = 0;
let previousBeforeRender = null;
let previousAfterRender = null;
let saved = null;

export function setDoor3Level0Visual({
  visible = active,
  anchorX = root.position.x,
  anchorZ = root.position.z,
  elapsed = time,
} = {}) {
  active = Boolean(visible);
  time = Math.max(0, Number(elapsed) || 0);
  root.visible = active;
  if (active) root.position.set(Number(anchorX) || 0, 0, Number(anchorZ) || 0);
}

export function resetDoor3Level0Visual() {
  active = false;
  time = 0;
  root.visible = false;
  root.position.set(0, 0, 0);
}

export function startDoor3Level0Renderer() {
  if (started) return;
  started = true;
  previousBeforeRender = scene.onBeforeRender;
  previousAfterRender = scene.onAfterRender;

  scene.onBeforeRender = function (...args) {
    previousBeforeRender?.apply(this, args);
    if (!active) return;

    saved = {
      cameraMask: camera.layers.mask,
      background: scene.background,
      fog: scene.fog,
      exposure: renderer.toneMappingExposure,
    };
    camera.layers.set(LAYER);
    scene.background = levelBackground;
    scene.fog = levelFog;
    renderer.toneMappingExposure = 1.02;

    // Cheap fluorescent shimmer: one material update, no light-grid animation.
    const shimmer = 0.965 + Math.sin(time * 37.0) * 0.018 + Math.sin(time * 13.0) * 0.012;
    panelMat.color.setRGB(1.0 * shimmer, 0.95 * shimmer, 0.76 * shimmer);
  };

  scene.onAfterRender = function (...args) {
    if (saved) {
      camera.layers.mask = saved.cameraMask;
      scene.background = saved.background;
      scene.fog = saved.fog;
      renderer.toneMappingExposure = saved.exposure;
      saved = null;
    }
    previousAfterRender?.apply(this, args);
  };
}

export function door3Level0Snapshot() {
  return {
    active,
    layer: LAYER,
    textureSize: TEX_SIZE,
    wallInstances: wallDefs.length,
    fixtureInstances: fixtureDefs.length,
    realLights: 3,
    bloom: false,
    collision: false,
    composer: false,
  };
}
