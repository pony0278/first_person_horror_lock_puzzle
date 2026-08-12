/* F2.4 — Door 3 environmental escalation.
 *
 * This layer deliberately remembers damage across directional threat stages.
 * The monster may move, but the room does not reset: branch darkness, standing
 * water, ceiling leaks and workbench vibration accumulate until Door 3 ends.
 */
import * as THREE from 'three';
import {
  door3EscalationVisual,
  initialDoor3EscalationMemory,
  rememberDoor3Escalation,
} from '../logic/door3-escalation.js';
import { pumpHub } from '../render/pumphub.js';
import { PUMP_CONSOLE_LAYOUT, pumpConsole } from '../render/pumpconsole.js';

const escalationGroup = new THREE.Group();
escalationGroup.name = 'door3-environmental-escalation';
pumpHub.add(escalationGroup);

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

const puddleMaterial = new THREE.MeshBasicMaterial({
  color: 0x28494c,
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
  color: 0xb9d8d9,
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
  workbenchPuddle.scale.set(0.18, 0.18, 1);
  leakMaterial.opacity = 0;
  warningLight.intensity = 0;
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
  const puddleScale = 0.18 + visual.puddle * 1.18;
  workbenchPuddle.scale.set(puddleScale * 1.20, puddleScale * 0.82, 1);

  leakMaterial.opacity = visual.leak * 0.72;
  writeLeak(time, visual.leak);

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
