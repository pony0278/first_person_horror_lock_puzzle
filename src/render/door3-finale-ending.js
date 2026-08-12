/* F2.5R.4 — endless escape corridor and unconsciousness ending.
 *
 * No black PlaneGeometry is allowed to impersonate distance. The corridor is
 * made from reusable physical chunks; chunks that fall behind the player wrap
 * ahead, while their lamps become progressively dimmer. The black face remains
 * fixed at the ruined floodgate and therefore recedes naturally with distance.
 */
import * as THREE from 'three';
import {
  DOOR3_ENDLESS_CORRIDOR,
  door3EndlessBrightness,
  door3EndlessChunkInitialCenter,
  door3EndlessRecycle,
} from '../logic/door3-endless-corridor.js';
import { DOOR3_FINALE } from '../logic/door3-finale.js';
import { DOOR3_ESCAPE } from '../logic/door3-transition.js';
import { camera } from './scene.js';
import { floodDoor } from './pumphub.js';

const endingRig = new THREE.Group();
endingRig.name = 'door3-finale-ending-rig';
floodDoor.add(endingRig);

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const RUN_START_LOCAL_Z = DOOR3_ESCAPE.endZ - DOOR3_ESCAPE.gateZ;
const SLIP_LOCAL_Z = RUN_START_LOCAL_Z - DOOR3_FINALE.secondRunDistance + 0.35;

/* Red contamination remains the physical reason for the fall. It now lives at
 * the actual endpoint of the longer R4 sprint instead of the old 8.4m endpoint. */
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
slipPuddle.position.set(0.16, 0.018, SLIP_LOCAL_Z);
slipPuddle.scale.set(0.56, 1.34, 1);
slipPuddle.visible = false;
slipPuddle.renderOrder = 7;
endingRig.add(slipPuddle);

/* ── Endless corridor chunks ─────────────────────────────────────────────── */
const CHUNK_H = 3.45;
const CHUNK_W = 2.46;
const CHUNK_L = DOOR3_ENDLESS_CORRIDOR.chunkLength;
const chunkBox = new THREE.BoxGeometry(1, 1, 1);

const addChunkBox = (group, material, sx, sy, sz, x, y, z, name) => {
  const mesh = new THREE.Mesh(chunkBox, material);
  mesh.name = name;
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
};

const makeChunk = index => {
  const group = new THREE.Group();
  group.name = `door3-endless-chunk-${index + 1}`;
  group.position.z = door3EndlessChunkInitialCenter(index);
  group.userData.generation = index;
  endingRig.add(group);

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x202629, roughness: 0.95, metalness: 0.03,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x292d2f, roughness: 0.92, metalness: 0.05,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x353b3d, roughness: 0.74, metalness: 0.38,
  });
  const lampMaterials = [];

  addChunkBox(group, floorMat, CHUNK_W, 0.08, CHUNK_L,
    0, -0.04, 0, `door3-endless-floor-${index + 1}`);
  addChunkBox(group, wallMat, 0.14, CHUNK_H, CHUNK_L,
    -CHUNK_W / 2, CHUNK_H / 2, 0, `door3-endless-wall-l-${index + 1}`);
  addChunkBox(group, wallMat, 0.14, CHUNK_H, CHUNK_L,
    CHUNK_W / 2, CHUNK_H / 2, 0, `door3-endless-wall-r-${index + 1}`);
  addChunkBox(group, wallMat, CHUNK_W, 0.10, CHUNK_L,
    0, CHUNK_H + 0.05, 0, `door3-endless-ceiling-${index + 1}`);

  for (const localZ of [-CHUNK_L / 2 + 0.12, CHUNK_L / 2 - 0.12]) {
    addChunkBox(group, metalMat, 0.14, 3.40, 0.18,
      -1.12, 1.70, localZ, `door3-endless-rib-l-${index}-${localZ}`);
    addChunkBox(group, metalMat, 0.14, 3.40, 0.18,
      1.12, 1.70, localZ, `door3-endless-rib-r-${index}-${localZ}`);
    addChunkBox(group, metalMat, 2.24, 0.14, 0.18,
      0, 3.29, localZ, `door3-endless-rib-top-${index}-${localZ}`);
  }

  for (const [lampIndex, localZ] of [-1.34, 1.34].entries()) {
    addChunkBox(group, metalMat, 0.72, 0.055, 0.18,
      0, 3.30, localZ, `door3-endless-lamp-housing-${index}-${lampIndex}`);
    const lampMaterial = new THREE.MeshBasicMaterial({
      color: 0xa8c9bd,
      toneMapped: false,
    });
    lampMaterials.push(lampMaterial);
    const lamp = addChunkBox(group, lampMaterial, 0.52, 0.025, 0.11,
      0, 3.235, localZ - 0.01, `door3-endless-lamp-${index}-${lampIndex}`);
    lamp.userData.sightlineIgnore = true;
  }

  return {
    group,
    floorMat,
    wallMat,
    metalMat,
    lampMaterials,
    initialGeneration: index,
  };
};

const chunks = Array.from(
  { length: DOOR3_ENDLESS_CORRIDOR.chunkCount },
  (_, index) => makeChunk(index),
);

const cameraWorld = new THREE.Vector3();
const cameraLocal = new THREE.Vector3();
let maxRunProgress = 0;

function materialBrightness(material, baseHex, brightness, floor = 0.22) {
  const amount = floor + (1 - floor) * brightness;
  material.color.setHex(baseHex).multiplyScalar(amount);
}

function updateChunkAppearance(chunk, runProgress, time) {
  const generation = chunk.group.userData.generation;
  const brightness = door3EndlessBrightness(generation, runProgress);
  materialBrightness(chunk.floorMat, 0x202629, brightness, 0.18);
  materialBrightness(chunk.wallMat, 0x292d2f, brightness, 0.16);
  materialBrightness(chunk.metalMat, 0x353b3d, brightness, 0.20);
  chunk.lampMaterials.forEach((material, lampIndex) => {
    const pulse = 0.88 + 0.12 * Math.abs(
      Math.sin(time * (2.1 + lampIndex * 0.37) + generation * 0.83),
    );
    const value = brightness * pulse;
    material.color.setRGB(0.66 * value, 0.79 * value, 0.74 * value);
  });
}

function updateEndlessCorridor(time) {
  camera.getWorldPosition(cameraWorld);
  cameraLocal.copy(cameraWorld);
  floodDoor.worldToLocal(cameraLocal);

  const travelled = Math.max(0, RUN_START_LOCAL_Z - cameraLocal.z);
  const runProgress = clamp01(travelled / DOOR3_FINALE.secondRunDistance);
  maxRunProgress = Math.max(maxRunProgress, runProgress);

  chunks.forEach(chunk => {
    const recycled = door3EndlessRecycle(chunk.group.position.z, cameraLocal.z);
    if (recycled.wraps > 0) {
      chunk.group.position.z = recycled.centerZ;
      chunk.group.userData.generation +=
        recycled.wraps * DOOR3_ENDLESS_CORRIDOR.chunkCount;
    }
    updateChunkAppearance(chunk, maxRunProgress, time);
  });

  return maxRunProgress;
}

/* ── Override the old fake-darkness objects after setDoor3FinaleVisual(). ─── */
function legacyObject(name) {
  return floodDoor.getObjectByName(name);
}

function suppressPhysicalBlackWalls() {
  const endCap = legacyObject('door3-finale-extension-dark-end');
  if (endCap) endCap.visible = false;
  const darknessFront = legacyObject('door3-finale-advancing-darkness');
  if (darknessFront) darknessFront.visible = false;
}

function keepThreatAtGate() {
  const face = legacyObject('door3-finale-black-face');
  if (!face) return;
  // Never translate the threat down the corridor. Perspective alone makes it
  // smaller as the player gets farther away.
  face.position.set(0, 1.42, 0.46);
  face.scale.set(1.02, 1.02, 1);
}

function overrideLegacyLamps(runProgress, time) {
  for (let index = 0; index < 7; index++) {
    const lamp = legacyObject(`door3-finale-lamp-${index + 1}`);
    const material = lamp?.material;
    if (!material?.color) continue;
    const brightness = door3EndlessBrightness(index, runProgress);
    const pulse = 0.90 + 0.10 * Math.abs(Math.sin(time * 2.7 + index * 0.91));
    const value = brightness * pulse;
    material.color.setRGB(0.66 * value, 0.79 * value, 0.74 * value);
  }
}

export function resetDoor3EndingVisual() {
  maxRunProgress = 0;
  slipPuddle.visible = false;
  slipMaterial.opacity = 0;
  slipPuddle.position.set(0.16, 0.018, SLIP_LOCAL_Z);
  slipPuddle.scale.set(0.56, 1.34, 1);

  chunks.forEach((chunk, index) => {
    chunk.group.position.z = door3EndlessChunkInitialCenter(index);
    chunk.group.userData.generation = chunk.initialGeneration;
    updateChunkAppearance(chunk, 0, 0);
  });

  suppressPhysicalBlackWalls();
  keepThreatAtGate();
}

export function setDoor3EndingVisual({
  slipProgress = 0,
  groundChaseProgress = 0,
  eyeFlash = 0,
  time = 0,
} = {}) {
  // groundChaseProgress / eyeFlash remain accepted for backward compatibility,
  // but R4 intentionally renders neither a chasing darkness plane nor near eyes.
  void groundChaseProgress;
  void eyeFlash;

  const runProgress = updateEndlessCorridor(time);
  suppressPhysicalBlackWalls();
  keepThreatAtGate();
  overrideLegacyLamps(runProgress, time);

  const slip = clamp01(slipProgress);
  slipPuddle.visible = slip > 0.01;
  slipMaterial.opacity = slip * (0.28 + 0.22 * Math.abs(Math.sin(time * 4.1)));
  slipPuddle.scale.x = 0.56 + slip * 0.18;
  slipPuddle.scale.y = 1.34 + slip * 0.38;
}

resetDoor3EndingVisual();
