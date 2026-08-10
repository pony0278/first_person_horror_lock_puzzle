/* Door 3 greybox: a flooded underground pump-hub intersection.
 *
 * This pass validates space, sightlines, and environmental language only.
 * The three-tank pressure puzzle and three-way monster chase stay inactive.
 */
import * as THREE from 'three';
import { DOOR_Z, boxGeo, cylGeo, planeGeo, scene } from './scene.js';
import { matCeil, matDark, matDoor, matFloor, matMetal, matWall } from './materials.js';

const H = 3.45;
const HUB_HALF = 2.70;
const BRANCH_HALF = 1.28;
const FRONT_END = -7.55;
// Door 2 opens onto a full 16 m connector before the pump-room intersection.
// REAR_END includes the 2.7 m half-width of the hub itself.
const REAR_END = 18.7;
const SIDE_END = 11.2;
const CENTER_WORLD_Z = DOOR_Z - REAR_END;

export const PUMP_HUB = Object.freeze({
  height: H,
  hubHalf: HUB_HALF,
  frontDoorZ: FRONT_END,
  rearEndZ: REAR_END,
  /** Door 2 and the rear pump corridor share this exact world-space seam. */
  rearOpeningWorldZ: DOOR_Z,
  /** Clear narrow connector visible between Door 2 and the hub threshold. */
  connectorLength: REAR_END - HUB_HALF,
  /** Total camera travel from its Door 2 origin to the hub centre. */
  runDistance: Math.abs(CENTER_WORLD_Z),
  /** The camera remains here during Door 3 exploration; no arrival teleport. */
  centerWorldZ: CENTER_WORLD_Z,
  leftEndX: -SIDE_END,
  rightEndX: SIDE_END,
});

export const pumpHub = new THREE.Group();
pumpHub.name = 'door3-pump-hub';
pumpHub.position.z = CENTER_WORLD_Z;
pumpHub.visible = false;
scene.add(pumpHub);

const matBulkhead = new THREE.MeshStandardMaterial({
  color: 0x343a3e, roughness: 0.72, metalness: 0.42,
});
const matPipe = new THREE.MeshStandardMaterial({
  color: 0x596166, roughness: 0.48, metalness: 0.52,
});
const matRust = new THREE.MeshStandardMaterial({
  color: 0x6a3d25, roughness: 0.88, metalness: 0.18,
});
const matHazard = new THREE.MeshStandardMaterial({
  color: 0x8a712d, roughness: 0.80, metalness: 0.12,
});
const matCable = new THREE.MeshStandardMaterial({
  color: 0x11171b, roughness: 0.78, metalness: 0.08,
});
const matGlass = new THREE.MeshPhysicalMaterial({
  color: 0x7f9aa0, roughness: 0.18, metalness: 0.04,
  transparent: true, opacity: 0.30, transmission: 0.08,
  side: THREE.DoubleSide, depthWrite: false,
});
const matWater = new THREE.MeshStandardMaterial({
  color: 0x172d32, roughness: 0.17, metalness: 0.18,
  transparent: true, opacity: 0.62, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -2,
});
const matFluid = new THREE.MeshStandardMaterial({
  color: 0x426f70, roughness: 0.25, metalness: 0.06,
  emissive: 0x102c30, emissiveIntensity: 0.34,
  transparent: true, opacity: 0.88,
});
const matRipple = new THREE.MeshBasicMaterial({
  color: 0x76989b, transparent: true, opacity: 0,
  depthWrite: false, side: THREE.DoubleSide,
});

const addBox = (parent, mat, sx, sy, sz, x, y, z) => {
  const mesh = new THREE.Mesh(boxGeo, mat);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
};
const addPlane = (parent, mat, sx, sz, x, y, z) => {
  const mesh = new THREE.Mesh(planeGeo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(sx, sz, 1);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
};
const addPipe = (parent, length, radius, x, y, z, axis = 'y', mat = matPipe) => {
  const mesh = new THREE.Mesh(cylGeo, mat);
  mesh.scale.set(radius, length, radius);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  else if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
};

/* Cross-shaped footprint: centre and four branches remain visually distinct. */
const frontLen = Math.abs(FRONT_END) - HUB_HALF;
const rearLen = REAR_END - HUB_HALF;
const sideLen = SIDE_END - HUB_HALF;

addBox(pumpHub, matFloor, HUB_HALF * 2, 0.08, HUB_HALF * 2, 0, -0.04, 0);
addBox(pumpHub, matFloor, HUB_HALF * 2, 0.08, frontLen, 0, -0.04,
  -(HUB_HALF + frontLen / 2));
addBox(pumpHub, matFloor, BRANCH_HALF * 2, 0.08, rearLen, 0, -0.04,
  HUB_HALF + rearLen / 2);
addBox(pumpHub, matFloor, sideLen, 0.08, BRANCH_HALF * 2,
  -(HUB_HALF + sideLen / 2), -0.04, 0);
addBox(pumpHub, matFloor, sideLen, 0.08, BRANCH_HALF * 2,
  HUB_HALF + sideLen / 2, -0.04, 0);

for (const [sx, sz, x, z] of [
  [HUB_HALF * 2, HUB_HALF * 2, 0, 0],
  [HUB_HALF * 2, frontLen, 0, -(HUB_HALF + frontLen / 2)],
  [BRANCH_HALF * 2, rearLen, 0, HUB_HALF + rearLen / 2],
  [sideLen, BRANCH_HALF * 2, -(HUB_HALF + sideLen / 2), 0],
  [sideLen, BRANCH_HALF * 2, HUB_HALF + sideLen / 2, 0],
]) addBox(pumpHub, matCeil, sx, 0.10, sz, x, H + 0.05, z);

/* Short corner walls and columns frame each opening without narrowing sightlines. */
const cornerSpan = HUB_HALF - BRANCH_HALF;
for (const z of [-HUB_HALF, HUB_HALF]) {
  for (const side of [-1, 1]) {
    addBox(pumpHub, matWall, cornerSpan, H, 0.12,
      side * (BRANCH_HALF + cornerSpan / 2), H / 2, z);
  }
}
for (const x of [-HUB_HALF, HUB_HALF]) {
  for (const side of [-1, 1]) {
    addBox(pumpHub, matWall, 0.12, H, cornerSpan,
      x, H / 2, side * (BRANCH_HALF + cornerSpan / 2));
  }
}
for (const x of [-HUB_HALF + 0.16, HUB_HALF - 0.16]) {
  for (const z of [-HUB_HALF + 0.16, HUB_HALF - 0.16]) {
    const col = addBox(pumpHub, matBulkhead, 0.30, H, 0.30, x, H / 2, z);
    col.rotation.y = 0.05 * Math.sign(x * z);
  }
}

/* Branch walls. The wider front arm keeps both the bulkhead and tanks readable. */
for (const x of [-HUB_HALF, HUB_HALF])
  addBox(pumpHub, matWall, 0.12, H, frontLen, x, H / 2,
    -(HUB_HALF + frontLen / 2));
for (const x of [-BRANCH_HALF, BRANCH_HALF])
  addBox(pumpHub, matWall, 0.12, H, rearLen, x, H / 2,
    HUB_HALF + rearLen / 2);
for (const z of [-BRANCH_HALF, BRANCH_HALF]) {
  addBox(pumpHub, matWall, sideLen, H, 0.12,
    -(HUB_HALF + sideLen / 2), H / 2, z);
  addBox(pumpHub, matWall, sideLen, H, 0.12,
    HUB_HALF + sideLen / 2, H / 2, z);
}

/* Repeated bulkhead ribs make forward motion readable across the long incoming
 * connector. They frame the centre sightline but never enter it. */
const matApproachLamp = new THREE.MeshBasicMaterial({ color: 0x6d3328 });
for (const [index, z] of [15.2, 11.2, 7.2, 3.2].entries()) {
  for (const side of [-1, 1]) {
    const pillar = addBox(pumpHub, matBulkhead, 0.16, H, 0.18,
      side * (BRANCH_HALF - 0.08), H / 2, z);
    pillar.name = 'door3-approach-rib';
  }
  const beam = addBox(pumpHub, matBulkhead, BRANCH_HALF * 2, 0.16, 0.18,
    0, H - 0.08, z);
  beam.name = 'door3-approach-rib';
  const tube = addBox(pumpHub, matApproachLamp, 0.42, 0.035, 0.10,
    0, H - 0.19, z - 0.08);
  tube.name = 'door3-approach-lamp';
  const guide = new THREE.PointLight(0x8c4030, index % 2 ? 0.18 : 0.28, 4.2, 1.9);
  guide.position.set(0, H - 0.34, z - 0.10);
  pumpHub.add(guide);
}

/* Deep exits reveal only darkness and a restrained directional colour. */
const rearVoid = addBox(pumpHub, matDark, BRANCH_HALF * 2, H, 0.04,
  0, H / 2, REAR_END);
const leftVoid = addBox(pumpHub, matDark, 0.04, H, BRANCH_HALF * 2,
  -SIDE_END, H / 2, 0);
const rightVoid = addBox(pumpHub, matDark, 0.04, H, BRANCH_HALF * 2,
  SIDE_END, H / 2, 0);
rearVoid.name = 'door3-rear-void';
// Door 2 now opens directly into this branch. The old dark cap would turn the
// connection into a wall and hide the pump room until after a scene swap.
rearVoid.visible = false;
leftVoid.name = 'door3-left-void';
rightVoid.name = 'door3-right-void';

/* Front branch: Door 3 flood bulkhead and a tank bank that never blocks it. */
export const floodDoor = new THREE.Group();
floodDoor.name = 'door3-flood-door';
floodDoor.position.z = FRONT_END;
pumpHub.add(floodDoor);

addBox(floodDoor, matBulkhead, HUB_HALF * 2, H, 0.28, 0, H / 2, 0);
const doorLeaf = addBox(floodDoor, matDoor, 2.10, 2.38, 0.24, 0, 1.19, 0.18);
doorLeaf.name = 'door3-leaf';
for (const [sx, sy, x, y] of [
  [0.18, 2.72, -1.14, 1.36], [0.18, 2.72, 1.14, 1.36],
  [2.46, 0.18, 0, 2.62], [2.46, 0.18, 0, 0.10],
]) addBox(floodDoor, matMetal, sx, sy, 0.32, x, y, 0.22);

for (const x of [-0.82, 0.82]) {
  for (const y of [0.33, 0.78, 1.23, 1.68, 2.13]) {
    const bolt = addPipe(floodDoor, 0.035, 0.045, x, y, 0.34, 'z', matMetal);
    bolt.name = 'door3-rivet';
  }
}

const wheel = new THREE.Group();
wheel.position.set(0, 1.25, 0.36);
floodDoor.add(wheel);
const rim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.038, 8, 20), matRust);
wheel.add(rim);
for (let i = 0; i < 4; i++) {
  const spoke = addBox(wheel, matRust, 0.54, 0.035, 0.035, 0, 0, 0);
  spoke.rotation.z = i * Math.PI / 4;
}
addPipe(wheel, 0.08, 0.07, 0, 0, 0.03, 'z', matMetal);

const matFrontTube = new THREE.MeshBasicMaterial({ color: 0x668487 });
addBox(pumpHub, matFrontTube, 0.58, 0.045, 0.13, 0, 2.86, -6.28);
const frontLight = new THREE.PointLight(0x789fa2, 0.92, 4.8, 1.9);
frontLight.position.set(0, 2.62, -6.12);
pumpHub.add(frontLight);


/* Three sight glasses share the left bank, keeping the door as the primary goal. */
export const pressureTanks = [];
const tankLevels = [0.74, 0.46, 0.92];
for (let i = 0; i < 3; i++) {
  const tank = new THREE.Group();
  tank.position.set(-2.18 + i * 0.43, 0.42, 0.36);
  floodDoor.add(tank);

  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.32, 14, 1, true), matGlass);
  glass.position.y = 0.66;
  tank.add(glass);
  const h = tankLevels[i];
  const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 1, 14), matFluid);
  fluid.scale.y = h;
  fluid.position.y = h / 2;
  tank.add(fluid);
  for (const y of [0, 1.32]) addPipe(tank, 0.07, 0.18, 0, y, 0, 'y', matMetal);
  addBox(tank, matHazard, 0.26, 0.025, 0.025, 0, 0.66, 0.16);
  tank.userData = { fluid, baseLevel: h };
  pressureTanks.push(tank);
}

/* Two latch pistons imply a future alignment goal without teaching the answer. */
export const pressurePistons = [];
for (const x of [1.46, 2.06]) {
  const piston = new THREE.Group();
  piston.position.set(x, 0.34, 0.37);
  floodDoor.add(piston);
  addPipe(piston, 1.34, 0.10, 0, 0.67, 0, 'y', matPipe);
  const collar = addBox(piston, matHazard, 0.28, 0.055, 0.09, 0, 0.67, 0.09);
  piston.userData = { collar };
  pressurePistons.push(piston);
}

for (const x of [-2.18, -1.75, -1.32]) {
  addPipe(floodDoor, 0.60, 0.035, x, 1.95, 0.12, 'y', matPipe);
  addPipe(floodDoor, 0.44, 0.035, x + 0.20, 2.23, 0.12, 'x', matPipe);
}

/* Left branch: heavy pumps, deeper water, and damaged amber lighting. */
addPipe(pumpHub, 7.7, 0.18, -6.75, 2.72, -0.62, 'x', matPipe);
for (const x of [-4.1, -6.8, -9.4]) {
  addPipe(pumpHub, 2.15, 0.11, x, 1.55, -0.62, 'y', matRust);
  addBox(pumpHub, matMetal, 0.48, 0.58, 0.72, x, 0.29, 0.58);
}
const pumpWheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.055, 8, 18), matHazard);
pumpWheel.rotation.y = Math.PI / 2;
pumpWheel.position.set(-5.45, 1.35, BRANCH_HALF - 0.14);
pumpHub.add(pumpWheel);

const leftLight = new THREE.PointLight(0xd08a42, 1.30, 6.4, 1.8);
leftLight.position.set(-5.4, 2.48, 0);
pumpHub.add(leftLight);
addBox(pumpHub, matHazard, 0.46, 0.07, 0.16, -5.4, 2.72, 0);

/* Right branch: cable trays, electrical cabinets, and cold residual light. */
for (const z of [-0.72, -0.45, -0.18]) {
  addPipe(pumpHub, 7.8, 0.025, 6.75, 2.86, z, 'x', matCable);
}
for (const x of [4.5, 6.2, 7.9]) {
  addBox(pumpHub, matBulkhead, 0.72, 1.65, 0.20, x, 0.83, BRANCH_HALF - 0.12);
  for (let k = 0; k < 3; k++)
    addBox(pumpHub, matDark, 0.46, 0.025, 0.025, x, 1.18 - k * 0.13, BRANCH_HALF - 0.24);
}
const rightLight = new THREE.PointLight(0x6f9fc2, 1.10, 6.5, 1.8);
rightLight.position.set(5.7, 2.55, 0);
pumpHub.add(rightLight);
addBox(pumpHub, matMetal, 0.48, 0.07, 0.16, 5.7, 2.73, 0);

/* Incoming branch: hanging chains and a dim red lamp layer the distant approach. */
for (const x of [-0.42, 0.38]) {
  for (let i = 0; i < 7; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.014, 6, 10), matMetal);
    link.position.set(x, 2.86 - i * 0.15, 5.2 + (x > 0 ? 0.32 : 0));
    link.rotation.y = i % 2 ? Math.PI / 2 : 0;
    pumpHub.add(link);
  }
}
const rearLight = new THREE.PointLight(0x7f2f28, 0.72, 5.8, 1.9);
rearLight.position.set(0, 2.5, 6.8);
pumpHub.add(rearLight);
addBox(pumpHub, matRust, 0.42, 0.07, 0.15, 0, 2.72, 6.8);

/* Flooding and ripple rigs reserve an honest visual language for future threats. */
for (const [sx, sz, x, z] of [
  [HUB_HALF * 2, HUB_HALF * 2, 0, 0],
  [HUB_HALF * 2, frontLen, 0, -(HUB_HALF + frontLen / 2)],
  [BRANCH_HALF * 2, rearLen, 0, HUB_HALF + rearLen / 2],
  [sideLen, BRANCH_HALF * 2, -(HUB_HALF + sideLen / 2), 0],
  [sideLen, BRANCH_HALF * 2, HUB_HALF + sideLen / 2, 0],
]) addPlane(pumpHub, matWater, sx, sz, x, 0.016, z);

const rippleDefs = [
  [-4.7, 0, 0.0], [5.1, 0.18, 0.9], [0.35, 5.3, 1.8],
  [-1.05, -3.55, 2.5],
];
export const pumpRipples = rippleDefs.map(([x, z, phase], i) => {
  const mat = matRipple.clone();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.315, 24), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.026 + i * 0.0004, z);
  ring.userData.phase = phase;
  pumpHub.add(ring);
  return ring;
});

/* Pump-room dust uses a cross distribution instead of the old narrow corridor. */
{
  const count = 260;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const arm = i % 4;
    let x = (Math.random() - 0.5) * HUB_HALF * 1.8;
    let z = (Math.random() - 0.5) * HUB_HALF * 1.8;
    if (arm === 0) z = -Math.random() * 7.2;
    if (arm === 1) z = Math.random() * 10.5;
    if (arm === 2) x = -Math.random() * 10.5;
    if (arm === 3) x = Math.random() * 10.5;
    positions[i * 3] = x;
    positions[i * 3 + 1] = 0.18 + Math.random() * (H - 0.35);
    positions[i * 3 + 2] = z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0x8fa3a5, size: 0.012, transparent: true, opacity: 0.28,
    depthWrite: false, fog: true,
  }));
  pumpHub.add(points);
  pumpHub.userData.dust = points;
}

/* Spatial anchors are shared by tests and the future chase system. */
export const door3Anchors = {
  front: new THREE.Object3D(),
  left: new THREE.Object3D(),
  right: new THREE.Object3D(),
  rear: new THREE.Object3D(),
};
door3Anchors.front.position.set(0, 1.35, FRONT_END + 0.25);
door3Anchors.left.position.set(-8.4, 1.45, 0);
door3Anchors.right.position.set(8.4, 1.45, 0);
door3Anchors.rear.position.set(0, 1.45, 8.4);
for (const anchor of Object.values(door3Anchors)) pumpHub.add(anchor);

let hubTime = 0;
export function updatePumpHub(dt) {
  if (!pumpHub.visible) return;
  hubTime += dt;

  leftLight.intensity = 1.05 +
    0.24 * Math.abs(Math.sin(hubTime * 7.1) * Math.sin(hubTime * 2.3));
  rightLight.intensity = 0.88 +
    0.20 * Math.abs(Math.sin(hubTime * 11.7));
  rearLight.intensity = 0.58 + 0.10 * Math.sin(hubTime * 1.7);
  frontLight.intensity = 0.82 +
    0.16 * Math.abs(Math.sin(hubTime * 8.9) * Math.sin(hubTime * 2.0));

  pumpRipples.forEach((ring, i) => {
    const cycle = (hubTime * (0.18 + i * 0.012) + ring.userData.phase) % 1;
    const scale = 0.55 + cycle * 3.2;
    ring.scale.setScalar(scale);
    ring.material.opacity = Math.sin(cycle * Math.PI) * 0.22;
  });

  pressureTanks.forEach((tank, i) => {
    tank.userData.fluid.position.y =
      tank.userData.baseLevel / 2 + Math.sin(hubTime * 0.65 + i) * 0.008;
  });
  pressurePistons.forEach((piston, i) => {
    piston.userData.collar.position.y =
      0.67 + Math.sin(hubTime * 0.55 + i * 1.7) * 0.025;
  });
  pumpHub.userData.dust.rotation.y += dt * 0.008;
}
