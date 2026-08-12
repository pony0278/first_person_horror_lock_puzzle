/* F2.4 / F2.4.1 — Door 3 environmental escalation.
 *
 * Damage is remembered across directional threat stages. F2.4.1 also carries
 * the same red seep language used by Doors 1/2 into the pump hub: wall seams
 * begin to bleed, clean standing water becomes contaminated, and the original
 * burst pipe gradually carries red material through the same leak.
 */
import * as THREE from 'three';
import {
  door3EscalationVisual,
  initialDoor3EscalationMemory,
  rememberDoor3Escalation,
} from '../logic/door3-escalation.js';
import { burstPipeRig, burstWaterJet, pumpHub } from '../render/pumphub.js';
import { PUMP_CONSOLE_LAYOUT, pumpConsole } from '../render/pumpconsole.js';

const escalationGroup = new THREE.Group();
escalationGroup.name = 'door3-environmental-escalation';
pumpHub.add(escalationGroup);

const CLEAR_WATER = new THREE.Color(0x28494c);
const CLEAR_DRIP = new THREE.Color(0xb9d8d9);
const RED_LIQUID = new THREE.Color(0x5e100c);
const RED_DRIP = new THREE.Color(0x8b2119);

const branchShadeMaterial = () => new THREE.MeshBasicMaterial({
  color: 0x020607,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  side: THREE.DoubleSide,
  toneMapped: false,
});

function makeBranchShade(name, x, y, z, sx, sy, yaw = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), branchShadeMaterial());
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, 1);
  mesh.rotation.y = yaw;
  mesh.renderOrder = 2;
  escalationGroup.add(mesh);
  return mesh;
}

const branchShade = {
  rear: makeBranchShade('door3-escalation-rear-shadow', 0, 1.58, 3.03, 2.35, 3.05),
  left: makeBranchShade('door3-escalation-left-shadow', -3.03, 1.58, 0, 2.35, 3.05, Math.PI / 2),
  right: makeBranchShade('door3-escalation-right-shadow', 3.03, 1.58, 0, 2.35, 3.05, Math.PI / 2),
};

/* Growing workbench puddle starts as pump water and progressively stains red. */
const puddleMaterial = new THREE.MeshStandardMaterial({
  color: CLEAR_WATER.clone(),
  roughness: 0.10,
  metalness: 0.02,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const workbenchPuddle = new THREE.Mesh(new THREE.CircleGeometry(1, 40), puddleMaterial);
workbenchPuddle.name = 'door3-workbench-growing-puddle';
workbenchPuddle.rotation.x = -Math.PI / 2;
workbenchPuddle.position.set(PUMP_CONSOLE_LAYOUT.x + 0.30, 0.027, PUMP_CONSOLE_LAYOUT.z + 0.62);
workbenchPuddle.scale.set(0.18, 0.18, 1);
workbenchPuddle.renderOrder = 3;
escalationGroup.add(workbenchPuddle);

/* Red pools spread away from the workbench so the whole hub reads as infected,
 * not merely a single red decal under the player's feet. */
const redPoolMaterial = new THREE.MeshStandardMaterial({
  color: RED_LIQUID.clone(),
  roughness: 0.09,
  metalness: 0.02,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const redPoolDefs = [
  [-0.65, -1.02, 1.05, 0.60, 0.10],
  [-3.65, 0.34, 1.45, 0.56, -0.18],
  [3.82, -0.46, 1.30, 0.52, 0.24],
  [0.18, 4.25, 1.20, 0.52, -0.08],
  [0.30, -4.30, 1.48, 0.58, 0.16],
];
const redPools = redPoolDefs.map(([x, z, sx, sz, rot], index) => {
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 36), redPoolMaterial);
  pool.name = `door3-red-pool-${index + 1}`;
  pool.rotation.x = -Math.PI / 2;
  pool.rotation.z = rot;
  pool.position.set(x, 0.032 + index * 0.0005, z);
  pool.userData.finalScale = { x: sx, z: sz };
  pool.scale.set(0.08, 0.08, 1);
  pool.renderOrder = 4;
  escalationGroup.add(pool);
  return pool;
});

/* Door 3-specific wall seep shader. It mirrors the Doors 1/2 vocabulary of a
 * wet seam, narrow trails and moving beads without sharing their corridor
 * uniforms or mutating their established decay state. */
function makeRedSeepMaterial(seed) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAmount: { value: 0 },
      uSeed: { value: seed },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
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
      uniform float uAmount;
      uniform float uSeed;

      float hash(float n) {
        return fract(sin(n * 91.17 + uSeed * 17.31) * 43758.5453);
      }

      void main() {
        float amount = clamp(uAmount, 0.0, 1.0);
        float seamY = 0.84;
        float spread = 0.12 + amount * 0.34;
        float centre = 0.50 + (hash(1.0) - 0.5) * 0.16;
        float seam = smoothstep(spread, spread * 0.28, abs(vUv.x - centre))
          * smoothstep(seamY - 0.055 - amount * 0.07, seamY, vUv.y)
          * (1.0 - smoothstep(seamY, seamY + 0.025, vUv.y));

        float trails = 0.0;
        float beads = 0.0;
        for (int i = 0; i < 6; i++) {
          float fi = float(i);
          float cx = centre + (hash(fi * 3.7 + 2.0) - 0.5) * spread * 1.72;
          float width = 0.007 + hash(fi * 5.1 + 3.0) * 0.018 + amount * 0.008;
          float run = (0.14 + hash(fi * 7.3 + 1.0) * 0.55) * (0.30 + amount * 0.92);
          float dx = abs(vUv.x - cx);
          float col = smoothstep(width, width * 0.30, dx);
          float trail = smoothstep(seamY - run, seamY - run * 0.88, vUv.y)
            * (1.0 - smoothstep(seamY, seamY + 0.01, vUv.y));
          trails = max(trails, col * trail);

          float cycle = fract(uTime * (0.045 + hash(fi + 9.0) * 0.075) + hash(fi + 4.0));
          float head = seamY - cycle * cycle * run;
          float beadX = dx / max(0.004, width * 1.75);
          float beadY = (vUv.y - head) / max(0.006, width * 3.2);
          float bead = 1.0 - smoothstep(0.42, 1.0, length(vec2(beadX, beadY)));
          bead *= smoothstep(0.02, 0.15, cycle) * (1.0 - smoothstep(0.82, 0.99, cycle));
          beads = max(beads, bead);
        }

        float cover = max(seam * 0.86, max(trails * 0.70, beads));
        cover *= smoothstep(0.03, 0.18, amount);
        if (cover < 0.012) discard;

        vec3 darkRed = vec3(0.23, 0.022, 0.015);
        vec3 wetRed = vec3(0.54, 0.075, 0.045);
        vec3 colour = mix(darkRed, wetRed, beads * 0.72 + seam * 0.14);
        gl_FragColor = vec4(colour, cover * (0.34 + amount * 0.62));
      }
    `,
  });
}

function makeWallSeep(name, x, y, z, sx, sy, yaw, seed) {
  const material = makeRedSeepMaterial(seed);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, 1);
  mesh.rotation.y = yaw;
  mesh.renderOrder = 5;
  escalationGroup.add(mesh);
  return mesh;
}

const wallSeeps = [
  makeWallSeep('door3-red-seep-workbench', -2.685, 1.48, -3.72, 2.25, 2.70, Math.PI / 2, 1.1),
  makeWallSeep('door3-red-seep-left-a', -4.50, 1.45, -1.265, 2.70, 2.55, 0, 2.4),
  makeWallSeep('door3-red-seep-left-b', -7.15, 1.36, 1.265, 2.35, 2.38, Math.PI, 3.8),
  makeWallSeep('door3-red-seep-right-a', 4.45, 1.52, 1.265, 2.55, 2.68, Math.PI, 5.2),
  makeWallSeep('door3-red-seep-right-b', 7.18, 1.35, -1.265, 2.20, 2.32, 0, 6.7),
  makeWallSeep('door3-red-seep-rear-a', -1.265, 1.44, 5.05, 2.52, 2.50, Math.PI / 2, 8.1),
  makeWallSeep('door3-red-seep-rear-b', 1.265, 1.38, 8.00, 2.30, 2.34, -Math.PI / 2, 9.6),
];

const leakCount = 26;
const leakPositions = new Float32Array(leakCount * 3);
const leakSeeds = Array.from({ length: leakCount }, (_, index) => ({
  x: PUMP_CONSOLE_LAYOUT.x - 0.90 + ((index * 37) % 100) / 100 * 2.05,
  z: PUMP_CONSOLE_LAYOUT.z - 0.48 + ((index * 61) % 100) / 100 * 1.75,
  phase: ((index * 47) % 101) / 101,
  speed: 0.76 + ((index * 29) % 53) / 53 * 0.84,
}));
const leakGeometry = new THREE.BufferGeometry();
leakGeometry.setAttribute('position', new THREE.BufferAttribute(leakPositions, 3));
const leakMaterial = new THREE.PointsMaterial({
  color: CLEAR_DRIP.clone(),
  size: 0.025,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  sizeAttenuation: true,
  toneMapped: false,
});
const ceilingLeak = new THREE.Points(leakGeometry, leakMaterial);
ceilingLeak.name = 'door3-workbench-ceiling-leak';
ceilingLeak.frustumCulled = false;
escalationGroup.add(ceilingLeak);

const warningLight = new THREE.PointLight(0xb16a35, 0, 4.2, 1.9);
warningLight.name = 'door3-workbench-escalation-light';
warningLight.position.set(PUMP_CONSOLE_LAYOUT.x + 0.62, 1.34, PUMP_CONSOLE_LAYOUT.z + 0.12);
escalationGroup.add(warningLight);

/* The burst pipe remains the same physical failure. A thin animated red core
 * grows inside the already-authored clear water jet instead of swapping the
 * stream to a different prop, so the player can recognise that the water has
 * become contaminated over time. */
const contaminationCurve = new THREE.CubicBezierCurve3(
  new THREE.Vector3(0.03, -0.01, 0),
  new THREE.Vector3(0.38, -0.10, -0.10),
  new THREE.Vector3(0.78, -0.96, -0.38),
  new THREE.Vector3(0.84, -2.14, -0.64),
);
const pipeContaminationUniforms = {
  uTime: { value: 0 },
  uMix: { value: 0 },
};
const pipeContaminationMaterial = new THREE.ShaderMaterial({
  uniforms: pipeContaminationUniforms,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
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
    uniform float uMix;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      float mixAmount = clamp(uMix, 0.0, 1.0);
      float vein = 0.56 + 0.44 * sin(vUv.x * 42.0 - uTime * 7.6 + sin(vUv.y * 13.0) * 2.2);
      float broken = smoothstep(0.26, 0.82, vein + hash(floor(vec2(vUv.x * 18.0, uTime * 2.2))) * 0.22);
      float edge = smoothstep(0.0, 0.18, min(vUv.y, 1.0 - vUv.y));
      float alpha = mixAmount * edge * (0.10 + broken * 0.56);
      if (alpha < 0.012) discard;
      vec3 darkRed = vec3(0.22, 0.018, 0.014);
      vec3 wetRed = vec3(0.62, 0.09, 0.055);
      gl_FragColor = vec4(mix(darkRed, wetRed, broken * 0.74), alpha);
    }
  `,
});
const pipeContaminationStream = new THREE.Mesh(
  new THREE.TubeGeometry(contaminationCurve, 30, 0.026, 7, false),
  pipeContaminationMaterial,
);
pipeContaminationStream.name = 'door3-burst-red-contamination-core';
pipeContaminationStream.visible = false;
pipeContaminationStream.frustumCulled = false;
burstPipeRig.add(pipeContaminationStream);

const baseConsole = {
  x: PUMP_CONSOLE_LAYOUT.x,
  y: 0,
  z: PUMP_CONSOLE_LAYOUT.z,
};
let memory = initialDoor3EscalationMemory();
let wasActive = false;
let started = false;
let lastFrame = null;
let jolt = 0;

function resetVisuals() {
  memory = initialDoor3EscalationMemory();
  jolt = 0;
  branchShade.left.material.opacity = 0;
  branchShade.right.material.opacity = 0;
  branchShade.rear.material.opacity = 0;
  puddleMaterial.opacity = 0;
  puddleMaterial.color.copy(CLEAR_WATER);
  workbenchPuddle.scale.set(0.18, 0.18, 1);
  redPoolMaterial.opacity = 0;
  redPools.forEach(pool => pool.scale.set(0.08, 0.08, 1));
  wallSeeps.forEach(seep => {
    seep.material.uniforms.uAmount.value = 0;
    seep.material.uniforms.uTime.value = 0;
  });
  leakMaterial.opacity = 0;
  leakMaterial.color.copy(CLEAR_DRIP);
  warningLight.intensity = 0;
  pipeContaminationUniforms.uMix.value = 0;
  pipeContaminationUniforms.uTime.value = 0;
  pipeContaminationStream.visible = false;
  pumpConsole.position.set(baseConsole.x, baseConsole.y, baseConsole.z);
}

function writeLeak(time, leakStrength) {
  const activeCount = Math.round(leakCount * leakStrength);
  for (let index = 0; index < leakCount; index++) {
    const offset = index * 3;
    const seed = leakSeeds[index];
    if (index >= activeCount) {
      leakPositions[offset] = seed.x;
      leakPositions[offset + 1] = 4.0;
      leakPositions[offset + 2] = seed.z;
      continue;
    }
    const cycle = (seed.phase + time * 0.24 * seed.speed) % 1;
    leakPositions[offset] = seed.x;
    leakPositions[offset + 1] = 3.18 - cycle * 2.74;
    leakPositions[offset + 2] = seed.z + Math.sin(time * 1.7 + index) * 0.012;
  }
  leakGeometry.attributes.position.needsUpdate = true;
}

function applyFrame(state, time, dt) {
  if (!state?.active) {
    if (wasActive) resetVisuals();
    wasActive = false;
    return;
  }
  if (!wasActive) resetVisuals();
  wasActive = true;

  const previousLevel = memory.level;
  memory = rememberDoor3Escalation(
    memory,
    state.threat?.stage ?? -1,
    state.threat?.direction ?? null,
  );
  if (memory.level > previousLevel) jolt = 1;
  jolt = Math.max(0, jolt - dt * 2.2);

  const visual = door3EscalationVisual(memory.level);
  const seenOpacity = visual.branchShade;
  branchShade.left.material.opacity = memory.seenLeft ? seenOpacity : seenOpacity * 0.28;
  branchShade.right.material.opacity = memory.seenRight ? seenOpacity : seenOpacity * 0.28;
  branchShade.rear.material.opacity = memory.seenRear ? seenOpacity : seenOpacity * 0.28;

  puddleMaterial.opacity = 0.04 + visual.puddle * 0.22;
  puddleMaterial.color.lerpColors(CLEAR_WATER, RED_LIQUID, visual.floorContamination * 0.86);
  const puddleScale = 0.18 + visual.puddle * 1.18;
  workbenchPuddle.scale.set(puddleScale * 1.20, puddleScale * 0.82, 1);

  redPoolMaterial.opacity = visual.floorContamination * 0.34;
  redPools.forEach((pool, index) => {
    const finalScale = pool.userData.finalScale;
    const activation = Math.max(0, Math.min(1,
      visual.floorContamination * 1.38 - index * 0.075,
    ));
    const scaleEase = activation * activation * (3 - 2 * activation);
    pool.scale.set(
      0.08 + finalScale.x * scaleEase,
      0.08 + finalScale.z * scaleEase,
      1,
    );
  });

  wallSeeps.forEach((seep, index) => {
    const branchDelay = index === 0 ? 0 : (index % 3) * 0.035;
    seep.material.uniforms.uAmount.value = Math.max(
      0,
      Math.min(1, visual.wallContamination - branchDelay),
    );
    seep.material.uniforms.uTime.value = time;
  });

  leakMaterial.opacity = visual.leak * 0.72;
  leakMaterial.color.lerpColors(
    CLEAR_DRIP,
    RED_DRIP,
    visual.wallContamination * 0.72,
  );
  writeLeak(time, visual.leak);

  pipeContaminationUniforms.uTime.value = time;
  pipeContaminationUniforms.uMix.value = visual.pipeContamination;
  pipeContaminationStream.visible = burstWaterJet.visible && visual.pipeContamination > 0.015;

  const warningPulse = 0.48 + 0.52 * Math.abs(
    Math.sin(time * (4.8 + memory.level * 1.7)) * Math.sin(time * 1.9),
  );
  warningLight.intensity = visual.warningLight * (0.30 + warningPulse * 1.15);

  const tremor = visual.benchTremor * (0.38 + jolt * 0.95);
  pumpConsole.position.x = baseConsole.x + Math.sin(time * 31.0) * 0.008 * tremor;
  pumpConsole.position.y = baseConsole.y + Math.sin(time * 37.0) * 0.004 * tremor;
  pumpConsole.position.z = baseConsole.z + Math.cos(time * 28.0) * 0.006 * tremor;
}

/**
 * Start one tiny visual companion loop. The main gameplay timer remains the
 * authority; this loop only mirrors already-authored Door 3 state into lasting
 * environment damage, so it cannot advance or kill the player on its own.
 */
export function startDoor3EnvironmentalEscalation(getDoor3State) {
  if (started || typeof requestAnimationFrame !== 'function') return;
  started = true;
  const frame = now => {
    const current = Number(now) || 0;
    const dt = lastFrame === null ? 0 : Math.min(0.05, Math.max(0, (current - lastFrame) / 1000));
    lastFrame = current;
    applyFrame(getDoor3State?.(), current / 1000, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
