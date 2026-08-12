/* F2.5.4 — final contaminated slip, ground darkness, and near-eye flash.
 *
 * This stays separate from the floodgate/black-face rig so the final beat can be
 * tuned without growing the already substantial F2.5.1–3 renderer. The puddle
 * exists in the physical corridor; only the very last eye flash is camera-bound.
 */
import * as THREE from 'three';
import { camera } from './scene.js';
import { floodDoor } from './pumphub.js';

const endingRig = new THREE.Group();
endingRig.name = 'door3-finale-ending-rig';
floodDoor.add(endingRig);

const slipMaterial = new THREE.MeshBasicMaterial({
  color: 0x6a0908,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const slipPuddle = new THREE.Mesh(new THREE.CircleGeometry(1, 40), slipMaterial);
slipPuddle.name = 'door3-finale-slip-puddle';
slipPuddle.rotation.x = -Math.PI / 2;
slipPuddle.position.set(0.16, 0.018, -12.08);
slipPuddle.scale.set(0.52, 1.18, 1);
slipPuddle.visible = false;
slipPuddle.renderOrder = 7;
endingRig.add(slipPuddle);

/* A second translucent darkness sheet closes the final two metres after the
 * player is already down. depthWrite stays off so the authored black face can
 * still burn through it before the final eye flash. */
const groundDarknessMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  depthTest: true,
  side: THREE.DoubleSide,
  toneMapped: false,
});
const groundDarkness = new THREE.Mesh(
  new THREE.PlaneGeometry(2.40, 3.35),
  groundDarknessMaterial,
);
groundDarkness.name = 'door3-finale-ground-darkness';
groundDarkness.position.set(0, 1.65, -10.28);
groundDarkness.visible = false;
groundDarkness.renderOrder = 7;
endingRig.add(groundDarkness);

function finalEyeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const eye = (x, y, rx, ry, colour, alpha, blur) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour;
    ctx.shadowColor = colour;
    ctx.shadowBlur = blur;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Wider separation than the distant face: this is too close to read as a
  // normal head and should register only as two blown-out lights in darkness.
  for (const [x, tilt] of [[150, -1], [362, 1]]) {
    eye(x - 10, 126 + tilt * 3, 56, 42, '#ff2a1c', 0.78, 28);
    eye(x + 10, 126 - tilt * 2, 56, 42, '#21dcff', 0.80, 28);
    eye(x, 126, 48, 36, '#ffffff', 1, 34);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

const nearEyeMaterial = new THREE.MeshBasicMaterial({
  map: finalEyeTexture(),
  transparent: true,
  opacity: 0,
  depthWrite: false,
  depthTest: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  toneMapped: false,
});
const nearEyes = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.53), nearEyeMaterial);
nearEyes.name = 'door3-finale-near-eyes';
nearEyes.position.set(0, 0.01, -0.45);
nearEyes.visible = false;
nearEyes.frustumCulled = false;
nearEyes.renderOrder = 1000;
camera.add(nearEyes);

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

export function resetDoor3EndingVisual() {
  slipPuddle.visible = false;
  slipMaterial.opacity = 0;
  slipPuddle.scale.set(0.52, 1.18, 1);
  groundDarkness.visible = false;
  groundDarknessMaterial.opacity = 0;
  groundDarkness.position.z = -10.28;
  nearEyes.visible = false;
  nearEyeMaterial.opacity = 0;
  nearEyes.position.x = 0;
  nearEyes.position.y = 0.01;
  nearEyes.scale.set(1, 1, 1);
}

export function setDoor3EndingVisual({
  slipProgress = 0,
  groundChaseProgress = 0,
  eyeFlash = 0,
  time = 0,
} = {}) {
  const slip = clamp01(slipProgress);
  const chase = clamp01(groundChaseProgress);
  const flash = clamp01(eyeFlash);

  slipPuddle.visible = slip > 0.01;
  slipMaterial.opacity = slip * (0.28 + 0.22 * Math.abs(Math.sin(time * 4.1)));
  slipPuddle.scale.x = 0.52 + slip * 0.18;
  slipPuddle.scale.y = 1.18 + slip * 0.34;

  groundDarkness.visible = chase > 0.01;
  groundDarknessMaterial.opacity = 0.18 + chase * 0.62;
  groundDarkness.position.z = THREE.MathUtils.lerp(-10.28, -12.46, chase);

  nearEyes.visible = flash > 0.01;
  nearEyeMaterial.opacity = flash *
    (0.84 + 0.16 * Math.abs(Math.sin(time * 41) * Math.sin(time * 13)));
  const scale = 0.94 + flash * 0.10;
  nearEyes.scale.set(scale, scale, 1);
  nearEyes.position.x = Math.sin(time * 53) * 0.012 * flash;
  nearEyes.position.y = 0.01 + Math.cos(time * 47) * 0.008 * flash;
}

resetDoor3EndingVisual();
