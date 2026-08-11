/* Door 3 greybox: a flooded underground pump-hub intersection.
 *
 * This pass validates space, sightlines, and environmental language only.
 * The three-tank pressure puzzle and three-way monster chase stay inactive.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DOOR_Z, boxGeo, cylGeo, planeGeo, scene } from './scene.js';
import { PUMP_CONSOLE, pumpPressureBar } from '../logic/pump-console.js';
import { DOOR3_OPERATOR } from '../logic/door3-transition.js';
import { matCeil, matDark, matDoor, matFloor, matMetal, matWall } from './materials.js';
import {
  attachPumpConsole, setPumpConsoleReadout, setPumpConsoleState,
  updatePumpConsole,
} from './pumpconsole.js';

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
  /** Straight travel from the Door 2 origin to the hub-centre reveal point. */
  runDistance: Math.abs(CENTER_WORLD_Z),
  centerWorldZ: CENTER_WORLD_Z,
  /** Final exploration pose in front of the low pump console. */
  operatorWorldX: DOOR3_OPERATOR.x,
  operatorWorldZ: CENTER_WORLD_Z + DOOR3_OPERATOR.z,
  operatorYaw: DOOR3_OPERATOR.yawDeg,
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
const matGlass = new THREE.MeshStandardMaterial({
  color: 0x7f9aa0, roughness: 0.28, metalness: 0.08,
  transparent: true, opacity: 0.24, depthWrite: false,
});
matGlass.forceSinglePass = true;
const matWater = new THREE.MeshBasicMaterial({
  color: 0x172d32,
  transparent: true, opacity: 0.62, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -2,
});
matWater.forceSinglePass = true;
const matFluid = new THREE.MeshBasicMaterial({
  color: 0x315b5d,
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

const transformMatrix = ([sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0]) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );

/** Merge immutable solid boxes that share one material into one draw call. */
const addMergedBoxes = (parent, mat, definitions, name) => {
  const sources = definitions.map(definition => boxGeo.clone().applyMatrix4(
    transformMatrix(definition),
  ));
  const geometry = mergeGeometries(sources, false);
  sources.forEach(source => source.dispose());
  if (!geometry) throw new Error(`Unable to merge Door 3 geometry batch: ${name}`);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = name;
  mesh.userData.performanceBatch = 'static';
  mesh.userData.sourceDrawCalls = definitions.length;
  parent.add(mesh);
  return mesh;
};

/** Repeated props keep independent transforms while sharing geometry/material state. */
const addInstancedBoxes = (parent, mat, definitions, name) => {
  const mesh = new THREE.InstancedMesh(boxGeo, mat, definitions.length);
  definitions.forEach((definition, index) => {
    mesh.setMatrixAt(index, transformMatrix(definition));
  });
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mesh.name = name;
  mesh.userData.performanceBatch = 'instances';
  mesh.userData.sourceDrawCalls = definitions.length;
  parent.add(mesh);
  return mesh;
};

/* Cross-shaped footprint: centre and four branches remain visually distinct. */
const frontLen = Math.abs(FRONT_END) - HUB_HALF;
const rearLen = REAR_END - HUB_HALF;
const sideLen = SIDE_END - HUB_HALF;

const surfaceFootprint = [
  [HUB_HALF * 2, HUB_HALF * 2, 0, 0],
  [HUB_HALF * 2, frontLen, 0, -(HUB_HALF + frontLen / 2)],
  [BRANCH_HALF * 2, rearLen, 0, HUB_HALF + rearLen / 2],
  [sideLen, BRANCH_HALF * 2, -(HUB_HALF + sideLen / 2), 0],
  [sideLen, BRANCH_HALF * 2, HUB_HALF + sideLen / 2, 0],
];
addMergedBoxes(pumpHub, matFloor,
  surfaceFootprint.map(([sx, sz, x, z]) => [sx, 0.08, sz, x, -0.04, z]),
  'door3-floor-batch');
addMergedBoxes(pumpHub, matCeil,
  surfaceFootprint.map(([sx, sz, x, z]) => [sx, 0.10, sz, x, H + 0.05, z]),
  'door3-ceiling-batch');

/* Short corner walls and columns frame the side and rear openings. The two
 * front threshold panels stay open, reserving a clear bay for the low
 * water-level and pressure workbench without blocking the rear sightline. */
const cornerSpan = HUB_HALF - BRANCH_HALF;
const wallDefinitions = [];
for (const z of [HUB_HALF]) {
  for (const side of [-1, 1]) {
    wallDefinitions.push([cornerSpan, H, 0.12,
      side * (BRANCH_HALF + cornerSpan / 2), H / 2, z]);
  }
}
for (const x of [-HUB_HALF, HUB_HALF]) {
  for (const side of [-1, 1]) {
    wallDefinitions.push([0.12, H, cornerSpan,
      x, H / 2, side * (BRANCH_HALF + cornerSpan / 2)]);
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
  wallDefinitions.push([0.12, H, frontLen, x, H / 2,
    -(HUB_HALF + frontLen / 2)]);
for (const x of [-BRANCH_HALF, BRANCH_HALF])
  wallDefinitions.push([0.12, H, rearLen, x, H / 2,
    HUB_HALF + rearLen / 2]);
for (const z of [-BRANCH_HALF, BRANCH_HALF]) {
  wallDefinitions.push([sideLen, H, 0.12,
    -(HUB_HALF + sideLen / 2), H / 2, z]);
  wallDefinitions.push([sideLen, H, 0.12,
    HUB_HALF + sideLen / 2, H / 2, z]);
}
addMergedBoxes(pumpHub, matWall, wallDefinitions, 'door3-wall-batch');

/* Repeated bulkhead ribs make forward motion readable across the long incoming
 * connector. They frame the centre sightline but never enter it. */
const matApproachLamp = new THREE.MeshBasicMaterial({ color: 0x6d3328 });
const approachRibDefinitions = [];
const approachLampDefinitions = [];
for (const z of [15.2, 11.2, 7.2, 3.2]) {
  for (const side of [-1, 1]) {
    approachRibDefinitions.push([0.16, H, 0.18,
      side * (BRANCH_HALF - 0.08), H / 2, z]);
  }
  approachRibDefinitions.push([BRANCH_HALF * 2, 0.16, 0.18,
    0, H - 0.08, z]);
  approachLampDefinitions.push([0.42, 0.035, 0.10,
    0, H - 0.19, z - 0.08]);
}
addInstancedBoxes(pumpHub, matBulkhead, approachRibDefinitions, 'door3-approach-ribs');
addInstancedBoxes(pumpHub, matApproachLamp, approachLampDefinitions, 'door3-approach-lamps');

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
export const doorLeaf = addBox(floodDoor, matDoor, 2.10, 2.38, 0.24, 0, 1.19, 0.18);
doorLeaf.name = 'door3-leaf';
doorLeaf.userData.closedY = 1.19;
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

export const wheel = new THREE.Group();
wheel.position.set(0, 1.25, 0.36);
floodDoor.add(wheel);
const rim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.038, 8, 20), matRust);
wheel.add(rim);
for (let i = 0; i < 4; i++) {
  const spoke = addBox(wheel, matRust, 0.54, 0.035, 0.035, 0, 0, 0);
  spoke.rotation.z = i * Math.PI / 4;
}
addPipe(wheel, 0.08, 0.07, 0, 0, 0.03, 'z', matMetal);

const matFrontTube = new THREE.MeshBasicMaterial({ color: 0x668487, toneMapped: false });
addBox(pumpHub, matFrontTube, 0.58, 0.045, 0.13, 0, 2.86, -6.28);


/* Three sight glasses share the left bank, keeping the door as the primary goal. */
export const pressureTanks = [];
const tankLevels = [...PUMP_CONSOLE.initialLevels];
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
  const targetLevel = PUMP_CONSOLE.targetLevels[i];
  const markY = targetLevel === null ? 0.66 : 1.32 * targetLevel;
  const markMat = targetLevel === null ? matHazard : matFrontTube;
  const band = addBox(tank, markMat, 0.26, targetLevel === null ? 0.025 : 0.038,
    0.025, 0, markY, 0.16);
  band.name = targetLevel === null
    ? 'door3-return-tank-mark'
    : `door3-latch-${i === 0 ? 'left' : 'right'}-target-band`;
  tank.userData = { fluid, displayLevel: h, targetLevel: h };
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
  piston.userData = { collar, targetLocked: false, displayLock: 0 };
  pressurePistons.push(piston);
}

for (const x of [-2.18, -1.75, -1.32]) {
  addPipe(floodDoor, 0.60, 0.035, x, 1.95, 0.12, 'y', matPipe);
  addPipe(floodDoor, 0.44, 0.035, x + 0.20, 2.23, 0.12, 'x', matPipe);
}

export function setPumpHubLevels(
  levels,
  pressureBar = pumpPressureBar(PUMP_CONSOLE.initialVolumes),
) {
  pressureTanks.forEach((tank, index) => {
    const level = Number(levels[index]);
    tank.userData.targetLevel = Math.max(
      PUMP_CONSOLE.minLevel,
      Math.min(PUMP_CONSOLE.maxLevel,
        Number.isFinite(level) ? level : PUMP_CONSOLE.initialLevels[index]),
    );
  });
  setPumpConsoleReadout(levels, pressureBar);
}

let floodDoorOpenRatio = 0;
export function setPumpHubPuzzleState({
  latchStates = [false, false],
  selectedSource = null,
  leverUnlocked = false,
  leverPulled = false,
  doorOpenRatio = floodDoorOpenRatio,
} = {}) {
  pressurePistons.forEach((piston, index) => {
    piston.userData.targetLocked = Boolean(latchStates[index]);
  });
  floodDoorOpenRatio = Math.max(0, Math.min(1, Number(doorOpenRatio) || 0));
  setPumpConsoleState({ selectedSource, leverUnlocked, leverPulled });
}

attachPumpConsole(pumpHub);
setPumpHubLevels(tankLevels, pumpPressureBar(PUMP_CONSOLE.initialVolumes));

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
leftLight.name = 'door3-key-light-left';
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
rightLight.name = 'door3-key-light-right';
rightLight.position.set(5.7, 2.55, 0);
pumpHub.add(rightLight);
addBox(pumpHub, matMetal, 0.48, 0.07, 0.16, 5.7, 2.73, 0);

/* Incoming branch: hanging chains and a dim red lamp layer the distant approach. */
const chainGeometry = new THREE.TorusGeometry(0.065, 0.014, 6, 10);
const chainDefinitions = [];
for (const x of [-0.42, 0.38]) {
  for (let i = 0; i < 7; i++) {
    chainDefinitions.push([1, 1, 1, x, 2.86 - i * 0.15,
      5.2 + (x > 0 ? 0.32 : 0), 0, i % 2 ? Math.PI / 2 : 0, 0]);
  }
}
const chainLinks = new THREE.InstancedMesh(chainGeometry, matMetal, chainDefinitions.length);
chainDefinitions.forEach((definition, index) => {
  chainLinks.setMatrixAt(index, transformMatrix(definition));
});
chainLinks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
chainLinks.instanceMatrix.needsUpdate = true;
chainLinks.computeBoundingBox();
chainLinks.computeBoundingSphere();
chainLinks.name = 'door3-chain-links';
chainLinks.userData.performanceBatch = 'instances';
chainLinks.userData.sourceDrawCalls = chainDefinitions.length;
pumpHub.add(chainLinks);
const matRearTube = new THREE.MeshBasicMaterial({ color: 0x612721, toneMapped: false });
addBox(pumpHub, matRearTube, 0.42, 0.07, 0.15, 0, 2.72, 6.8);

/* First legal pump action ruptures this return pipe behind the operator. */
const burstImpact = new THREE.Vector3(-0.28, 0.03, 0.98);
export const burstPipeRig = new THREE.Group();
burstPipeRig.name = 'door3-burst-pipe-rig';
burstPipeRig.position.set(-1.12, 2.18, 1.62);
pumpHub.add(burstPipeRig);
addPipe(burstPipeRig, 1.25, 0.12, -0.48, 0, 0, 'x', matPipe);
const burstLoosePipe = addPipe(burstPipeRig, 0.58, 0.12, 0.36, 0, 0, 'x', matRust);
burstLoosePipe.name = 'door3-burst-loose-pipe';
const burstRim = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.025, 8, 16), matRust);
burstRim.rotation.y = Math.PI / 2;
burstRim.position.x = 0.02;
burstPipeRig.add(burstRim);

const burstCurve = new THREE.CubicBezierCurve3(
  new THREE.Vector3(0.03, -0.01, 0),
  new THREE.Vector3(0.38, -0.10, -0.10),
  new THREE.Vector3(0.78, -0.96, -0.38),
  new THREE.Vector3(0.84, -2.14, -0.64),
);

function makeBurstRibbonGeometry(referenceAxis) {
  const segments = 18;
  const positions = [];
  const uvs = [];
  const indices = [];
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const centre = burstCurve.getPoint(t);
    burstCurve.getTangent(t, tangent).normalize();
    side.crossVectors(tangent, referenceAxis).normalize();
    const brokenEdge = 0.92 + Math.sin(i * 2.71 + referenceAxis.x * 3.1) * 0.08;
    const width = THREE.MathUtils.lerp(0.030, 0.070, Math.sin(t * Math.PI)) * brokenEdge;
    for (const sign of [-1, 1]) {
      positions.push(
        centre.x + side.x * width * sign,
        centre.y + side.y * width * sign,
        centre.z + side.z * width * sign,
      );
      uvs.push((sign + 1) / 2, t);
    }
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const burstStreamUniforms = {
  uTime: { value: 0 },
  uPressure: { value: 0 },
  uBurst: { value: 0 },
};
const burstStreamMaterial = new THREE.ShaderMaterial({
  uniforms: burstStreamUniforms,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime;
    uniform float uPressure;
    uniform float uBurst;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
    }
    void main() {
      float edge = smoothstep(0.0, 0.16, min(vUv.x, 1.0 - vUv.x));
      vec2 flowUv = vec2(vUv.x * 3.7, vUv.y * 10.0 - uTime * 5.2);
      float coarse = noise(flowUv);
      float fine = noise(flowUv * 2.3 + 4.7);
      float gaps = smoothstep(0.34 - uPressure * 0.05, 0.66, coarse * 0.72 + fine * 0.38);
      float pulse = 0.80 + 0.20 * sin(vUv.y * 27.0 - uTime * 13.0 + fine * 4.0);
      float foam = smoothstep(0.70, 0.96, fine + uBurst * 0.16);
      float alpha = edge * gaps * pulse * (0.06 + uPressure * 0.21);
      if (alpha < 0.025) discard;
      vec3 deepWater = vec3(0.50, 0.70, 0.72);
      vec3 whiteWater = vec3(0.87, 0.97, 0.98);
      vec3 colour = mix(deepWater, whiteWater, foam * 0.74 + edge * 0.10);
      gl_FragColor = vec4(colour, alpha);
    }
  `,
});
burstStreamMaterial.name = 'door3-broken-water-stream-material';

export const burstWaterJet = new THREE.Group();
burstWaterJet.name = 'door3-burst-water-flow';
burstWaterJet.visible = false;
burstPipeRig.add(burstWaterJet);
for (const [name, axis] of [
  ['front-ribbon', new THREE.Vector3(0, 0, 1)],
  ['cross-ribbon', new THREE.Vector3(1, 0, 0)],
]) {
  const ribbon = new THREE.Mesh(makeBurstRibbonGeometry(axis), burstStreamMaterial);
  ribbon.name = `door3-burst-${name}`;
  ribbon.frustumCulled = false;
  burstWaterJet.add(ribbon);
}

function radialDropTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(235,252,255,.95)');
  gradient.addColorStop(0.28, 'rgba(173,224,232,.72)');
  gradient.addColorStop(1, 'rgba(91,151,161,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

const dropTexture = radialDropTexture();
const makeBurstPoints = (count, name, size) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(count * 3, 3));
  const material = new THREE.PointsMaterial({
    color: 0xc7edf0,
    map: dropTexture,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    alphaTest: 0.025,
    depthWrite: false,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = name;
  points.frustumCulled = false;
  return points;
};

const deterministic = (index, salt) => {
  const value = Math.sin((index + 1) * 91.17 + salt * 37.31) * 43758.5453;
  return value - Math.floor(value);
};
const mouthParticleData = Array.from({ length: 34 }, (_, i) => ({
  delay: deterministic(i, 1) * 0.16,
  life: 0.30 + deterministic(i, 2) * 0.34,
  vx: 1.15 + deterministic(i, 3) * 1.65,
  vy: (deterministic(i, 4) - 0.40) * 1.55,
  vz: (deterministic(i, 5) - 0.5) * 1.35,
}));
const burstMouthSpray = makeBurstPoints(mouthParticleData.length,
  'door3-burst-mouth-spray', 0.075);
burstMouthSpray.position.set(0.04, 0, 0);
burstWaterJet.add(burstMouthSpray);

const impactParticleData = Array.from({ length: 38 }, (_, i) => ({
  offset: deterministic(i, 6) * 0.72,
  life: 0.48 + deterministic(i, 7) * 0.32,
  vx: (deterministic(i, 8) - 0.5) * 1.45,
  vy: 0.55 + deterministic(i, 9) * 1.05,
  vz: (deterministic(i, 10) - 0.5) * 1.35,
}));
const burstImpactSplash = makeBurstPoints(impactParticleData.length,
  'door3-burst-impact-splash', 0.065);
burstImpactSplash.visible = false;
pumpHub.add(burstImpactSplash);

const mouthMist = new THREE.Sprite(new THREE.SpriteMaterial({
  map: dropTexture, color: 0xc9edf0, transparent: true, opacity: 0,
  depthWrite: false, toneMapped: false,
}));
mouthMist.name = 'door3-burst-mouth-mist';
mouthMist.position.set(0.08, -0.01, 0);
mouthMist.scale.set(0.45, 0.33, 1);
mouthMist.raycast = () => {};
burstWaterJet.add(mouthMist);
const impactMist = new THREE.Sprite(mouthMist.material.clone());
impactMist.name = 'door3-burst-impact-mist';
impactMist.position.copy(burstImpact).add(new THREE.Vector3(0, 0.08, 0));
impactMist.scale.set(0.72, 0.24, 1);
impactMist.visible = false;
impactMist.raycast = () => {};
pumpHub.add(impactMist);

const burstRipples = [0, 0.18, 0.36].map((delay, index) => {
  const material = matRipple.clone();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.23, 0.285, 24), material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(burstImpact.x, burstImpact.y + index * 0.0005, burstImpact.z);
  ring.visible = false;
  ring.userData.delay = delay;
  pumpHub.add(ring);
  return ring;
});

const burstDebris = [
  [-1.38, 1.66, -1.47, 0.18, 0.08],
  [-0.94, 1.78, -1.14, 0.03, -0.11],
  [-1.17, 1.34, -1.32, -0.18, 0.15],
].map(([startX, startZ, endX, endZ, turn], index) => {
  const debris = addBox(pumpHub, index === 1 ? matHazard : matRust,
    0.14 + index * 0.025, 0.035, 0.08 + index * 0.02,
    startX, 0.052 + index * 0.002, startZ);
  debris.name = `door3-burst-debris-${index + 1}`;
  debris.userData = { startX, startZ, endX, endZ, turn };
  return debris;
});

const pipeBurstState = {
  triggered: false,
  t: 0,
  debrisProgress: 0,
  pressure: 0,
  phase: 'idle',
};

const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth01 = value => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};

function burstPressureAt(time) {
  const surge = smooth01(time / 0.12);
  if (time <= 1.20) return surge;
  return 0.24 + 0.76 * Math.exp(-(time - 1.20) * 2.45);
}

function writeMouthParticles(time) {
  const positions = burstMouthSpray.geometry.attributes.position.array;
  mouthParticleData.forEach((particle, index) => {
    const age = time - particle.delay;
    const visible = age >= 0 && age <= particle.life;
    const offset = index * 3;
    if (!visible) {
      positions[offset] = positions[offset + 1] = positions[offset + 2] = 0;
      return;
    }
    positions[offset] = particle.vx * age;
    positions[offset + 1] = particle.vy * age - 2.2 * age * age;
    positions[offset + 2] = particle.vz * age;
  });
  burstMouthSpray.geometry.attributes.position.needsUpdate = true;
}

function writeImpactParticles(time) {
  const positions = burstImpactSplash.geometry.attributes.position.array;
  impactParticleData.forEach((particle, index) => {
    const start = time - 0.24 + particle.offset;
    const age = start < 0 ? -1 : start % particle.life;
    const offset = index * 3;
    if (age < 0) {
      positions[offset] = burstImpact.x;
      positions[offset + 1] = burstImpact.y;
      positions[offset + 2] = burstImpact.z;
      return;
    }
    positions[offset] = burstImpact.x + particle.vx * age;
    positions[offset + 1] = burstImpact.y + particle.vy * age - 2.45 * age * age;
    positions[offset + 2] = burstImpact.z + particle.vz * age;
  });
  burstImpactSplash.geometry.attributes.position.needsUpdate = true;
}

export function triggerPumpPipeBurst() {
  if (pipeBurstState.triggered) return false;
  pipeBurstState.triggered = true;
  pipeBurstState.t = 0;
  pipeBurstState.debrisProgress = 0;
  pipeBurstState.pressure = 0;
  pipeBurstState.phase = 'rupture';
  burstWaterJet.visible = true;
  burstImpactSplash.visible = true;
  impactMist.visible = true;
  burstRipples.forEach(ring => { ring.visible = true; });
  return true;
}

export function resetPumpHubEffects() {
  pipeBurstState.triggered = false;
  pipeBurstState.t = 0;
  pipeBurstState.debrisProgress = 0;
  pipeBurstState.pressure = 0;
  pipeBurstState.phase = 'idle';
  burstWaterJet.visible = false;
  burstImpactSplash.visible = false;
  impactMist.visible = false;
  burstStreamUniforms.uTime.value = 0;
  burstStreamUniforms.uPressure.value = 0;
  burstStreamUniforms.uBurst.value = 0;
  burstMouthSpray.material.opacity = 0;
  burstImpactSplash.material.opacity = 0;
  mouthMist.material.opacity = 0;
  impactMist.material.opacity = 0;
  writeMouthParticles(-1);
  writeImpactParticles(-1);
  burstLoosePipe.rotation.z = 0;
  burstRipples.forEach(ring => {
    ring.visible = false;
    ring.material.opacity = 0;
    ring.scale.setScalar(1);
  });
  burstDebris.forEach(debris => {
    const data = debris.userData;
    debris.position.set(data.startX, debris.position.y, data.startZ);
    debris.rotation.y = 0;
  });
  floodDoorOpenRatio = 0;
  doorLeaf.position.y = doorLeaf.userData.closedY;
  wheel.rotation.z = 0;
  pressurePistons.forEach(piston => {
    piston.userData.targetLocked = false;
    piston.userData.displayLock = 0;
  });
}

export function pumpHubEffectSnapshot() {
  return {
    pipeBurst: pipeBurstState.triggered,
    burstT: +pipeBurstState.t.toFixed(2),
    jetVisible: burstWaterJet.visible,
    phase: pipeBurstState.phase,
    streamPressure: +pipeBurstState.pressure.toFixed(2),
    mouthMistOpacity: +mouthMist.material.opacity.toFixed(2),
    impactSplashVisible: burstImpactSplash.visible,
    debrisProgress: +pipeBurstState.debrisProgress.toFixed(2),
    latchRetraction: pressurePistons.map(piston =>
      +piston.userData.displayLock.toFixed(2)),
    doorOpenRatio: +floodDoorOpenRatio.toFixed(2),
  };
}

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
  const rearPulse = 0.76 + 0.10 * Math.sin(hubTime * 1.7);
  matRearTube.color.setRGB(0.38 * rearPulse, 0.15 * rearPulse, 0.12 * rearPulse);
  const frontPulse = 0.82 +
    0.16 * Math.abs(Math.sin(hubTime * 8.9) * Math.sin(hubTime * 2.0));
  matFrontTube.color.setRGB(0.40 * frontPulse, 0.52 * frontPulse, 0.53 * frontPulse);

  pumpRipples.forEach((ring, i) => {
    const cycle = (hubTime * (0.18 + i * 0.012) + ring.userData.phase) % 1;
    const scale = 0.55 + cycle * 3.2;
    ring.scale.setScalar(scale);
    ring.material.opacity = Math.sin(cycle * Math.PI) * 0.22;
  });

  if (pipeBurstState.triggered) {
    pipeBurstState.t += dt;
    const burstT = pipeBurstState.t;
    const impact = Math.max(0, 1 - burstT / 0.52);
    burstLoosePipe.rotation.z = Math.sin(burstT * 52) * 0.09 * impact - 0.035;
    const pressure = burstPressureAt(burstT);
    const burstPulse = 1 - smooth01((burstT - 0.05) / 0.34);
    pipeBurstState.pressure = pressure;
    pipeBurstState.phase = burstT < 0.25
      ? 'rupture'
      : burstT < 1.20 ? 'surge' : 'leak';
    burstStreamUniforms.uTime.value = hubTime;
    burstStreamUniforms.uPressure.value = pressure *
      (0.94 + Math.sin(hubTime * 19) * 0.06);
    burstStreamUniforms.uBurst.value = burstPulse;
    // Pressure changes the stream width without turning it into a rigid solid.
    const streamScale = 0.44 + pressure * 0.56;
    burstWaterJet.scale.x = 0.52 + streamScale * 0.48;
    burstWaterJet.scale.z = 0.52 + streamScale * 0.48;

    writeMouthParticles(burstT);
    writeImpactParticles(burstT);
    burstMouthSpray.material.opacity = burstPulse * 0.88;
    burstImpactSplash.material.opacity = Math.min(0.78, pressure * 0.72);
    mouthMist.material.opacity = burstPulse * 0.62;
    const mouthMistScale = 0.36 + smooth01(burstT / 0.22) * 0.50;
    mouthMist.scale.set(mouthMistScale, mouthMistScale * 0.72, 1);
    impactMist.material.opacity = 0.10 + pressure * 0.26;
    impactMist.scale.set(0.62 + pressure * 0.26, 0.19 + pressure * 0.10, 1);

    burstRipples.forEach(ring => {
      const localT = burstT - ring.userData.delay;
      if (localT < 0 || localT > 1.25) {
        ring.material.opacity = 0;
        return;
      }
      const p = localT / 1.25;
      ring.scale.setScalar(0.7 + p * 7.5);
      ring.material.opacity = Math.sin(p * Math.PI) * 0.42;
    });

    const driftP = Math.max(0, Math.min(1, (burstT - 0.28) / 0.92));
    const driftEase = driftP * driftP * (3 - 2 * driftP);
    pipeBurstState.debrisProgress = driftP;
    burstDebris.forEach((debris, index) => {
      const data = debris.userData;
      debris.position.x = THREE.MathUtils.lerp(data.startX, data.endX, driftEase);
      debris.position.z = THREE.MathUtils.lerp(data.startZ, data.endZ, driftEase);
      debris.position.y = 0.052 + index * 0.002 + Math.sin(hubTime * 3 + index) * 0.006;
      debris.rotation.y = data.turn * driftEase + Math.sin(hubTime + index) * 0.04;
    });
  }

  const levelBlend = 1 - Math.exp(-Math.max(0, dt) * 5.5);
  pressureTanks.forEach((tank, i) => {
    tank.userData.displayLevel +=
      (tank.userData.targetLevel - tank.userData.displayLevel) * levelBlend;
    tank.userData.fluid.scale.y = tank.userData.displayLevel;
    tank.userData.fluid.position.y =
      tank.userData.displayLevel / 2 + Math.sin(hubTime * 0.65 + i) * 0.006;
  });
  pressurePistons.forEach((piston, i) => {
    piston.userData.displayLock +=
      ((piston.userData.targetLocked ? 1 : 0) - piston.userData.displayLock) * levelBlend;
    piston.userData.collar.position.y = 0.67 - piston.userData.displayLock * 0.34 +
      Math.sin(hubTime * 0.55 + i * 1.7) * 0.025 * (1 - piston.userData.displayLock);
  });
  const doorEase = floodDoorOpenRatio * floodDoorOpenRatio *
    (3 - 2 * floodDoorOpenRatio);
  doorLeaf.position.y = doorLeaf.userData.closedY + doorEase * 2.52;
  wheel.rotation.z = -doorEase * Math.PI * 1.35;
  updatePumpConsole(dt);
  pumpHub.userData.dust.rotation.y += dt * 0.008;
}
