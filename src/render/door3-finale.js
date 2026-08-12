/* F2.5.1 / F2.5.2 / F2.5.3 — physical floodgate damage, black-face reveal,
 * corridor blackout, and the extended second-escape passage.
 *
 * The face is procedural: a transparent CanvasTexture supplies overexposed eyes,
 * a too-wide grin, and RGB separation. It lives behind the real floodgate, so
 * the reveal remains part of the 3D corridor instead of becoming a screen-space
 * jumpscare.
 */
import * as THREE from 'three';
import { doorLeaf, floodDoor } from './pumphub.js';

const finaleRig = new THREE.Group();
finaleRig.name = 'door3-finale-rig';
floodDoor.add(finaleRig);

const metalDamageMat = doorLeaf.material.clone();
metalDamageMat.roughness = Math.max(0.62, metalDamageMat.roughness ?? 0.7);
metalDamageMat.metalness = Math.max(0.35, metalDamageMat.metalness ?? 0.35);

const dentMat = metalDamageMat.clone();
dentMat.color.multiplyScalar(0.72);
dentMat.transparent = true;
dentMat.opacity = 0;
dentMat.depthWrite = false;

const rimMat = new THREE.MeshBasicMaterial({
  color: 0x2a1110,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const dentDefs = [
  [-0.38, 1.57, 0.35, 0.24, -0.08],
  [0.43, 1.15, 0.43, 0.29, 0.10],
  [-0.10, 0.64, 0.52, 0.34, -0.04],
];

const dents = dentDefs.map(([x, y, rx, ry, rz], index) => {
  const group = new THREE.Group();
  group.name = `door3-finale-dent-${index + 1}`;
  group.position.set(x, y, -0.075);
  group.rotation.z = rz;
  group.visible = false;
  finaleRig.add(group);

  const bulge = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), dentMat.clone());
  bulge.name = `door3-finale-bulge-${index + 1}`;
  bulge.scale.set(rx, ry, 0.085 + index * 0.018);
  group.add(bulge);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(Math.max(rx, ry) * 0.83, 0.022 + index * 0.004, 7, 28),
    rimMat.clone(),
  );
  rim.name = `door3-finale-dent-rim-${index + 1}`;
  rim.scale.y = ry / Math.max(rx, ry);
  rim.position.z = -0.058;
  group.add(rim);
  return { group, bulge, rim };
});

const crackMat = new THREE.LineBasicMaterial({
  color: 0x160707,
  transparent: true,
  opacity: 0,
  depthWrite: false,
});
const crackPositions = [];
for (const [cx, cy, rx, ry] of dentDefs) {
  for (let arm = 0; arm < 5; arm++) {
    const a = arm / 5 * Math.PI * 2 + cx * 0.7;
    const x1 = cx + Math.cos(a) * rx * 0.48;
    const y1 = cy + Math.sin(a) * ry * 0.48;
    const x2 = cx + Math.cos(a + 0.10) * rx * (1.05 + arm * 0.08);
    const y2 = cy + Math.sin(a + 0.10) * ry * (1.05 + arm * 0.08);
    const xm = (x1 + x2) / 2 + Math.sin(a * 3.1) * 0.055;
    const ym = (y1 + y2) / 2 + Math.cos(a * 2.3) * 0.045;
    crackPositions.push(x1, y1, -0.145, xm, ym, -0.148, xm, ym, -0.148, x2, y2, -0.145);
  }
}
const crackGeometry = new THREE.BufferGeometry();
crackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(crackPositions, 3));
const cracks = new THREE.LineSegments(crackGeometry, crackMat);
cracks.name = 'door3-finale-gate-cracks';
cracks.visible = false;
finaleRig.add(cracks);

/* Thin contaminated runoff entering the supposedly safe corridor through the
 * damaged gate seam. It carries F2.4.1's red-liquid language into the finale. */
const leakMaterial = new THREE.MeshBasicMaterial({
  color: 0x5c0c09,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const gateLeak = new THREE.Mesh(new THREE.CircleGeometry(1, 36), leakMaterial);
gateLeak.name = 'door3-finale-red-gate-leak';
gateLeak.rotation.x = -Math.PI / 2;
gateLeak.scale.set(0.18, 0.55, 1);
gateLeak.position.set(0.18, 0.025, -0.58);
gateLeak.renderOrder = 5;
finaleRig.add(gateLeak);

/* On rupture the single rigid leaf is replaced by six pieces that kick toward
 * the escape corridor. The original leaf is restored on every reset. */
const fragmentGeo = new THREE.BoxGeometry(1, 1, 1);
const brokenGate = new THREE.Group();
brokenGate.name = 'door3-finale-broken-gate';
brokenGate.visible = false;
finaleRig.add(brokenGate);
const fragmentDefs = [];
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 2; col++) {
    const index = row * 2 + col;
    fragmentDefs.push({
      x: col === 0 ? -0.52 : 0.52,
      y: 0.42 + row * 0.77,
      kickX: (col === 0 ? -1 : 1) * (0.10 + index * 0.025),
      kickY: (row - 1) * 0.07 + (index % 2 ? 0.035 : -0.02),
      kickZ: 0.28 + index * 0.055,
      rz: (col === 0 ? -1 : 1) * (0.08 + row * 0.055),
      rx: (row - 1) * 0.055,
    });
  }
}
const fragments = fragmentDefs.map((def, index) => {
  const mesh = new THREE.Mesh(fragmentGeo, metalDamageMat);
  mesh.name = `door3-finale-gate-fragment-${index + 1}`;
  mesh.scale.set(1.00, 0.72, 0.22);
  mesh.position.set(def.x, def.y, 0.18);
  brokenGate.add(mesh);
  return mesh;
});

const voidMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0,
  depthWrite: true,
  side: THREE.DoubleSide,
  toneMapped: false,
});
const blackVoid = new THREE.Mesh(new THREE.PlaneGeometry(2.42, 2.58), voidMaterial);
blackVoid.name = 'door3-finale-black-void';
blackVoid.position.set(0, 1.33, 0.52);
blackVoid.visible = false;
finaleRig.add(blackVoid);

function faceTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');

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

  const toothCentres = Array.from({ length: 15 }, (_, i) => {
    const t = i / 14;
    const x = 92 + t * 328;
    const u = (t - 0.5) * 2;
    const y = 184 + (1 - u * u) * 92;
    const h = 28 + (1 - Math.abs(u)) * 30;
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

  // Chromatic ghosts first, then the blown-out white core.
  drawEye(163 - 8, 105, 38, 31, '#ff2b1d', 0.80, 18);
  drawEye(349 - 8, 101, 42, 33, '#ff2b1d', 0.80, 18);
  drawEye(163 + 8, 105, 38, 31, '#27d9ff', 0.82, 18);
  drawEye(349 + 8, 101, 42, 33, '#27d9ff', 0.82, 18);
  drawEye(163, 105, 34, 28, '#ffffff', 1, 24);
  drawEye(349, 101, 37, 29, '#ffffff', 1, 24);

  drawGrin(-7, '#ff3020', 0.72, 13);
  drawGrin(7, '#22dfff', 0.74, 13);
  drawGrin(0, '#fffdf2', 1, 17);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

const faceMaterial = new THREE.MeshBasicMaterial({
  map: faceTexture(),
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  toneMapped: false,
});
const blackFace = new THREE.Mesh(new THREE.PlaneGeometry(3.35, 2.52), faceMaterial);
blackFace.name = 'door3-finale-black-face';
blackFace.position.set(0, 1.42, 0.46);
blackFace.visible = false;
blackFace.renderOrder = 8;
finaleRig.add(blackFace);

/* F2.5.3 extends the old escape corridor instead of letting the camera run
 * beyond authored geometry. floodDoor local z=0 is the gate; the original
 * corridor ends around -7.05, so this continuation reaches -13.45. */
const corridorExtension = new THREE.Group();
corridorExtension.name = 'door3-finale-corridor-extension';
finaleRig.add(corridorExtension);
const corridorFloorMat = new THREE.MeshStandardMaterial({
  color: 0x202629, roughness: 0.94, metalness: 0.04,
});
const corridorWallMat = new THREE.MeshStandardMaterial({
  color: 0x292d2f, roughness: 0.90, metalness: 0.06,
});
const corridorMetalMat = new THREE.MeshStandardMaterial({
  color: 0x353b3d, roughness: 0.72, metalness: 0.40,
});
const addCorridorBox = (material, sx, sy, sz, x, y, z, name) => {
  const mesh = new THREE.Mesh(fragmentGeo, material);
  mesh.name = name;
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  corridorExtension.add(mesh);
  return mesh;
};
const corridorStartZ = -7.02;
const corridorEndZ = -13.45;
const corridorLength = Math.abs(corridorEndZ - corridorStartZ);
const corridorCentreZ = (corridorStartZ + corridorEndZ) / 2;
addCorridorBox(corridorFloorMat, 2.46, 0.08, corridorLength,
  0, -0.04, corridorCentreZ, 'door3-finale-extension-floor');
addCorridorBox(corridorWallMat, 0.14, 3.45, corridorLength,
  -1.23, 1.725, corridorCentreZ, 'door3-finale-extension-left-wall');
addCorridorBox(corridorWallMat, 0.14, 3.45, corridorLength,
  1.23, 1.725, corridorCentreZ, 'door3-finale-extension-right-wall');
addCorridorBox(corridorWallMat, 2.46, 0.10, corridorLength,
  0, 3.50, corridorCentreZ, 'door3-finale-extension-ceiling');
for (const [index, z] of [-7.35, -9.45, -11.55, -13.20].entries()) {
  addCorridorBox(corridorMetalMat, 0.14, 3.40, 0.18,
    -1.12, 1.70, z, `door3-finale-extension-rib-l-${index}`);
  addCorridorBox(corridorMetalMat, 0.14, 3.40, 0.18,
    1.12, 1.70, z, `door3-finale-extension-rib-r-${index}`);
  addCorridorBox(corridorMetalMat, 2.24, 0.14, 0.18,
    0, 3.29, z, `door3-finale-extension-rib-top-${index}`);
}
const farCapMat = new THREE.MeshBasicMaterial({ color: 0x020304, toneMapped: false });
addCorridorBox(farCapMat, 2.34, 3.30, 0.03,
  0, 1.65, corridorEndZ - 0.02, 'door3-finale-extension-dark-end');

/* Seven visible ceiling lamps cross the existing corridor and the extension.
 * They use emissive-looking unlit materials instead of seven PointLights, so
 * the authored chase does not explode Door 3's light/draw budget. */
const corridorLampZ = [-1.35, -3.15, -4.95, -6.75, -8.55, -10.35, -12.15];
const corridorLamps = corridorLampZ.map((z, index) => {
  const housing = addCorridorBox(corridorMetalMat, 0.72, 0.055, 0.18,
    0, 3.30, z, `door3-finale-lamp-housing-${index + 1}`);
  housing.userData.sightlineIgnore = true;
  const material = new THREE.MeshBasicMaterial({
    color: 0xa8c9bd,
    toneMapped: false,
  });
  const lamp = addCorridorBox(material, 0.52, 0.025, 0.11,
    0, 3.235, z - 0.01, `door3-finale-lamp-${index + 1}`);
  lamp.userData.sightlineIgnore = true;
  return { lamp, material };
});

/* A physical darkness front advances with the lamp failures. The face rides
 * just in front of it, so looking back reads as a creature inside approaching
 * darkness rather than a flat full-screen overlay. */
const darknessMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0,
  depthWrite: true,
  side: THREE.DoubleSide,
  toneMapped: false,
});
const darknessFront = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 3.30), darknessMaterial);
darknessFront.name = 'door3-finale-advancing-darkness';
darknessFront.position.set(0, 1.65, 0.20);
darknessFront.visible = false;
darknessFront.renderOrder = 6;
finaleRig.add(darknessFront);

export function resetDoor3FinaleVisual() {
  doorLeaf.visible = true;
  dents.forEach(({ group, bulge, rim }) => {
    group.visible = false;
    bulge.material.opacity = 0;
    rim.material.opacity = 0;
  });
  cracks.visible = false;
  crackMat.opacity = 0;
  gateLeak.visible = false;
  leakMaterial.opacity = 0;
  gateLeak.scale.set(0.18, 0.55, 1);
  brokenGate.visible = false;
  fragments.forEach((mesh, index) => {
    const def = fragmentDefs[index];
    mesh.position.set(def.x, def.y, 0.18);
    mesh.rotation.set(0, 0, 0);
  });
  blackVoid.visible = false;
  voidMaterial.opacity = 0;
  blackFace.visible = false;
  faceMaterial.opacity = 0;
  blackFace.position.set(0, 1.42, 0.46);
  blackFace.scale.set(1, 1, 1);
  darknessFront.visible = false;
  darknessMaterial.opacity = 0;
  darknessFront.position.z = 0.20;
  corridorLamps.forEach(({ material }) => material.color.setHex(0xa8c9bd));
}

export function setDoor3FinaleVisual({
  impacts = 0,
  breakProgress = 0,
  faceProgress = 0,
  blackoutLamps = 0,
  blackoutProgress = 0,
  chaseProgress = 0,
  time = 0,
} = {}) {
  const damage = Math.max(0, Math.min(3, Math.trunc(impacts)));
  const broken = Math.max(0, Math.min(1, Number(breakProgress) || 0));
  const face = Math.max(0, Math.min(1, Number(faceProgress) || 0));
  const lampCount = Math.max(0, Math.min(corridorLamps.length, Math.trunc(blackoutLamps)));
  const blackout = Math.max(0, Math.min(1, Number(blackoutProgress) || 0));
  const chase = Math.max(0, Math.min(1, Number(chaseProgress) || 0));

  dents.forEach(({ group, bulge, rim }, index) => {
    const active = damage > index;
    group.visible = active && broken < 0.88;
    bulge.material.opacity = active ? 0.92 : 0;
    rim.material.opacity = active ? 0.80 : 0;
    const pulse = active ? 1 + Math.sin(time * 9 + index * 1.7) * 0.015 : 1;
    group.scale.setScalar(pulse);
  });
  cracks.visible = damage >= 2 && broken < 0.88;
  crackMat.opacity = damage >= 2 ? 0.42 + damage * 0.14 : 0;

  gateLeak.visible = damage >= 1;
  leakMaterial.opacity = damage === 0 ? 0 : 0.10 + damage * 0.12 + broken * 0.16;
  gateLeak.scale.x = 0.18 + damage * 0.17 + broken * 0.30;
  gateLeak.scale.y = 0.55 + damage * 0.22 + broken * 0.42;

  if (broken > 0.02) {
    brokenGate.visible = true;
    doorLeaf.visible = broken < 0.16;
    fragments.forEach((mesh, index) => {
      const def = fragmentDefs[index];
      const p = broken * broken * (3 - 2 * broken);
      mesh.position.x = def.x + def.kickX * p;
      mesh.position.y = def.y + def.kickY * p;
      mesh.position.z = 0.18 - def.kickZ * p;
      mesh.rotation.x = def.rx * p;
      mesh.rotation.z = def.rz * p;
    });
  }

  const reveal = Math.max(broken, face);
  blackVoid.visible = reveal > 0.02;
  voidMaterial.opacity = 0.86 * reveal;
  blackFace.visible = face > 0.015;
  const flicker = 0.82 + 0.18 * Math.abs(Math.sin(time * 13.7) * Math.sin(time * 3.1));
  faceMaterial.opacity = face * flicker;

  corridorLamps.forEach(({ material }, index) => {
    if (index < lampCount) {
      material.color.setRGB(0.008, 0.010, 0.010);
      return;
    }
    const next = index === lampCount && blackout > 0;
    const unstable = next
      ? 0.42 + 0.58 * Math.abs(Math.sin(time * 22.7) * Math.sin(time * 7.1))
      : 0.90 + 0.10 * Math.abs(Math.sin(time * 2.7 + index));
    material.color.setRGB(0.66 * unstable, 0.79 * unstable, 0.74 * unstable);
  });

  const initialChase = blackout * 0.28;
  const darknessChase = Math.max(initialChase, chase);
  darknessFront.visible = darknessChase > 0.015;
  darknessMaterial.opacity = Math.min(0.96, 0.58 + darknessChase * 0.38);
  darknessFront.position.z = 0.20 - darknessChase * 10.60;

  const creep = 0.86 + face * 0.18 + darknessChase * 0.13;
  blackFace.scale.set(creep, creep, 1);
  blackFace.position.x = Math.sin(time * 31) * 0.012 * face;
  blackFace.position.y = 1.42 + Math.cos(time * 23) * 0.008 * face;
  blackFace.position.z = darknessChase > 0.015
    ? darknessFront.position.z - 0.055
    : 0.46;
}

resetDoor3FinaleVisual();
