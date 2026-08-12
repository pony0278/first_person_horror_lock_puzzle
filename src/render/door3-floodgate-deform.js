/* F2.5R.2 — real vertex-deformed floodgate skins.
 *
 * The original finale used SphereGeometry/TorusGeometry overlays to suggest
 * dents. This companion replaces that read with two linked subdivided steel
 * skins. A monster-side crater and safe-side bulge are generated from the same
 * plastic-deformation profile, then normals are recomputed so lighting reveals
 * the actual bent metal.
 */
import * as THREE from 'three';
import { DOOR3_FINALE } from '../logic/door3-finale.js';
import { door3MetalDisplacement } from '../logic/door3-metal-deform.js';
import { doorLeaf, floodDoor } from './pumphub.js';

const WIDTH = 2.10;
const HEIGHT = 2.38;
const HALF_DEPTH = 0.12;
const LEAF_CENTRE_Y = 1.19;
const LEAF_CENTRE_Z = 0.18;
const SAFE_Z = LEAF_CENTRE_Z - HALF_DEPTH - 0.006;
const MONSTER_Z = LEAF_CENTRE_Z + HALF_DEPTH + 0.006;
const SEG_X = 52;
const SEG_Y = 60;

const deformationRig = new THREE.Group();
deformationRig.name = 'door3-vertex-deformed-floodgate';
deformationRig.visible = false;
floodDoor.add(deformationRig);

const makeSkin = (surface, z) => {
  const geometry = new THREE.PlaneGeometry(WIDTH, HEIGHT, SEG_X, SEG_Y);
  const material = doorLeaf.material.clone();
  material.side = THREE.DoubleSide;
  material.metalness = Math.max(0.62, material.metalness ?? 0.62);
  material.roughness = Math.min(0.48, Math.max(0.28, material.roughness ?? 0.38));
  material.transparent = true;
  material.opacity = 1;
  material.depthWrite = true;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `door3-deformed-${surface}-skin`;
  mesh.position.set(0, LEAF_CENTRE_Y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  deformationRig.add(mesh);

  const position = geometry.attributes.position;
  const original = new Float32Array(position.array);
  return { surface, mesh, geometry, material, position, original };
};

const safeSkin = makeSkin('safe', SAFE_Z);
const monsterSkin = makeSkin('monster', MONSTER_Z);
const skins = [safeSkin, monsterSkin];

/* The perimeter stays stiff. This makes the centre read as a constrained steel
 * sheet yielding inside a heavy frame rather than a rubber plane. */
const edgeMaterial = doorLeaf.material.clone();
edgeMaterial.metalness = Math.max(0.58, edgeMaterial.metalness ?? 0.58);
edgeMaterial.roughness = Math.min(0.54, edgeMaterial.roughness ?? 0.42);
edgeMaterial.transparent = true;
edgeMaterial.opacity = 1;
const edgeGroup = new THREE.Group();
edgeGroup.name = 'door3-deformed-leaf-perimeter';
deformationRig.add(edgeGroup);
const addEdge = (sx, sy, x, y) => {
  const edge = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, HALF_DEPTH * 2), edgeMaterial);
  edge.position.set(x, y, LEAF_CENTRE_Z);
  edge.castShadow = true;
  edge.receiveShadow = true;
  edgeGroup.add(edge);
};
addEdge(WIDTH, 0.065, 0, LEAF_CENTRE_Y + HEIGHT / 2 - 0.0325);
addEdge(WIDTH, 0.065, 0, LEAF_CENTRE_Y - HEIGHT / 2 + 0.0325);
addEdge(0.065, HEIGHT - 0.13, -WIDTH / 2 + 0.0325, LEAF_CENTRE_Y);
addEdge(0.065, HEIGHT - 0.13, WIDTH / 2 - 0.0325, LEAF_CENTRE_Y);

let started = false;
let activeRound = false;
let lastSignature = '';

function legacyDentObjects() {
  return [
    floodDoor.getObjectByName('door3-finale-dent-1'),
    floodDoor.getObjectByName('door3-finale-dent-2'),
    floodDoor.getObjectByName('door3-finale-dent-3'),
    floodDoor.getObjectByName('door3-finale-gate-cracks'),
  ].filter(Boolean);
}

function hideLegacyDentOverlays() {
  legacyDentObjects().forEach(object => { object.visible = false; });
}

function impactAges(state, impactCount) {
  if (state.phase === 'finale-checkback') {
    return DOOR3_FINALE.impactTimes.map((time, index) =>
      index < impactCount ? state.t - time : -1);
  }
  // F2.5R.3 resets state.t when the third hit starts the second escape. Keep
  // the first two dents permanently set, but let the third hit finish its
  // 0.31-second plastic overshoot while the player is already running away.
  if (state.phase === 'finale-run2' && impactCount >= 3) return [1, 1, state.t];
  return DOOR3_FINALE.impactTimes.map((_, index) => index < impactCount ? 1 : -1);
}

function writeSkin(skin, ages) {
  const array = skin.position.array;
  const original = skin.original;
  for (let i = 0; i < skin.position.count; i++) {
    const offset = i * 3;
    const x = original[offset];
    const y = original[offset + 1];
    array[offset] = x;
    array[offset + 1] = y;
    array[offset + 2] = original[offset + 2] +
      door3MetalDisplacement(x, y, skin.surface, ages);
  }
  skin.position.needsUpdate = true;
  skin.geometry.computeVertexNormals();
  skin.geometry.attributes.normal.needsUpdate = true;
  skin.geometry.computeBoundingSphere();
}

function resetGeometry() {
  skins.forEach(skin => {
    skin.position.array.set(skin.original);
    skin.position.needsUpdate = true;
    skin.geometry.computeVertexNormals();
    skin.geometry.attributes.normal.needsUpdate = true;
    skin.material.opacity = 1;
  });
  edgeMaterial.opacity = 1;
  deformationRig.visible = false;
  doorLeaf.visible = true;
  lastSignature = '';
}

function applyFrame(state) {
  if (!state?.active) {
    if (activeRound) resetGeometry();
    activeRound = false;
    return;
  }
  activeRound = true;

  const impactCount = Math.max(0, Math.min(3, state.finale?.impactCount ?? 0));
  const breakProgress = Math.max(0, Math.min(1, state.finale?.breakProgress ?? 0));
  if (impactCount <= 0) {
    deformationRig.visible = false;
    return;
  }

  hideLegacyDentOverlays();

  const ages = impactAges(state, impactCount);
  const signature = `${impactCount}:${ages.map(age => Math.max(-1, age).toFixed(3)).join(':')}`;
  if (signature !== lastSignature && breakProgress < 0.82) {
    skins.forEach(skin => writeSkin(skin, ages));
    lastSignature = signature;
  }

  const breakFade = Math.max(0, Math.min(1, (breakProgress - 0.22) / 0.58));
  const opacity = 1 - breakFade;
  skins.forEach(skin => { skin.material.opacity = opacity; });
  edgeMaterial.opacity = opacity;
  deformationRig.visible = opacity > 0.02;

  // The high-detail skins replace the original flat BoxGeometry while damaged.
  // Existing finale fragments take over once rupture is visibly under way.
  doorLeaf.visible = breakProgress >= 0.16 && breakProgress < 0.22;
  if (breakProgress < 0.16) doorLeaf.visible = false;
  if (breakProgress >= 0.22) doorLeaf.visible = false;
}

export function startDoor3FloodgateDeformation(getDoor3State) {
  if (started || typeof requestAnimationFrame !== 'function') return;
  started = true;
  const frame = () => {
    applyFrame(getDoor3State?.());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function door3FloodgateDeformationSnapshot() {
  const safe = safeSkin.position.array;
  const monster = monsterSkin.position.array;
  let safeMin = 0;
  let monsterMin = 0;
  for (let i = 2; i < safe.length; i += 3) safeMin = Math.min(safeMin, safe[i]);
  for (let i = 2; i < monster.length; i += 3) monsterMin = Math.min(monsterMin, monster[i]);
  return {
    visible: deformationRig.visible,
    safeMaxBulge: +Math.abs(safeMin).toFixed(4),
    monsterMaxCrater: +Math.abs(monsterMin).toFixed(4),
  };
}

resetGeometry();
