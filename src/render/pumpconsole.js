/* Low Door 3 workbench: outlet/inlet valves, latch gauge, and master lever. */
import * as THREE from 'three';
import { PUMP_CONSOLE, pumpPressureBar } from '../logic/pump-console.js';
import { boxGeo, camera, planeGeo, renderer } from './scene.js';
import { matMetal } from './materials.js';

export const PUMP_CONSOLE_LAYOUT = Object.freeze({
  x: -1.40,
  z: -2.22,
  width: 2.30,
  depth: 0.68,
  height: 1.18,
  clearLaneMinX: -0.25,
});

const FRONT_LIP_TOP = 0.75;
const LOWER_CONTROL_Y = 0.82;
const CONTROL_HALF_HEIGHT = 0.115 / 2;
export const PUMP_CONSOLE_VISUAL = Object.freeze({
  frontLipTop: FRONT_LIP_TOP,
  lowerControlY: LOWER_CONTROL_Y,
  lowerButtonBottom: LOWER_CONTROL_Y - CONTROL_HALF_HEIGHT,
  lowerGlyphClearance: LOWER_CONTROL_Y - CONTROL_HALF_HEIGHT - FRONT_LIP_TOP,
});

const matFrame = new THREE.MeshStandardMaterial({
  color: 0x293136, roughness: 0.76, metalness: 0.48,
});
const matPanel = new THREE.MeshStandardMaterial({
  color: 0x171d20, roughness: 0.82, metalness: 0.34,
});
const matRaise = new THREE.MeshStandardMaterial({
  color: 0x3f716b, roughness: 0.56, metalness: 0.28,
});
const matLower = new THREE.MeshStandardMaterial({
  color: 0x76513a, roughness: 0.62, metalness: 0.24,
});
const matGlyph = new THREE.MeshBasicMaterial({ color: 0xd4ded9, toneMapped: false });
const matLevel = new THREE.MeshBasicMaterial({ color: 0x4f9a91, toneMapped: false });
const matNeedle = new THREE.MeshBasicMaterial({ color: 0xd76c4f, toneMapped: false });
const matSourceLampOff = new THREE.MeshBasicMaterial({ color: 0x392b20, toneMapped: false });
const matSourceLampOn = new THREE.MeshBasicMaterial({ color: 0xe4a05c, toneMapped: false });
const matLeverLocked = new THREE.MeshStandardMaterial({
  color: 0x403a38, roughness: 0.72, metalness: 0.38,
});
const matLeverReady = new THREE.MeshStandardMaterial({
  color: 0x846c37, roughness: 0.58, metalness: 0.42,
});

const addBox = (parent, material, sx, sy, sz, x, y, z) => {
  const mesh = new THREE.Mesh(boxGeo, material);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
};

export const pumpConsole = new THREE.Group();
pumpConsole.name = 'door3-pump-console';
pumpConsole.position.set(PUMP_CONSOLE_LAYOUT.x, 0, PUMP_CONSOLE_LAYOUT.z);
pumpConsole.userData.layout = PUMP_CONSOLE_LAYOUT;

/* The shell ends at x=-0.25, leaving the centre/right route to the flood door open. */
addBox(pumpConsole, matFrame, 2.30, 0.10, 0.68, 0, 0.70, 0);
addBox(pumpConsole, matPanel, 2.30, 0.48, 0.10, 0, 0.94, -0.29);
for (const x of [-0.95, 0.95]) {
  for (const z of [-0.24, 0.24])
    addBox(pumpConsole, matFrame, 0.12, 0.68, 0.12, x, 0.34, z);
}
addBox(pumpConsole, matMetal, 1.95, 0.08, 0.10, 0, 0.22, -0.24);

function labelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  context.fillStyle = '#111719';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#536063';
  context.lineWidth = 3;
  context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  context.fillStyle = '#b9c7c4';
  context.font = '700 25px monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '700 21px monospace';
  context.fillText('LATCH-L · 6     RETURN · 4     LATCH-R · 3', 256, 33);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function gaugeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = '#e0ded1';
  context.beginPath();
  context.arc(128, 128, 122, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#22292c';
  context.lineWidth = 8;
  context.stroke();
  context.translate(128, 128);
  for (let i = 0; i <= 10; i++) {
    const angle = (210 + i * 24) * Math.PI / 180;
    const major = i % 5 === 0;
    context.strokeStyle = '#283033';
    context.lineWidth = major ? 6 : 3;
    context.beginPath();
    context.moveTo(Math.cos(angle) * (major ? 78 : 86), Math.sin(angle) * (major ? 78 : 86));
    context.lineTo(Math.cos(angle) * 106, Math.sin(angle) * 106);
    context.stroke();
  }
  context.fillStyle = '#22292c';
  context.font = '700 28px monospace';
  context.textAlign = 'center';
  context.fillText('LOCK', 0, 55);
  context.font = '700 20px monospace';
  context.fillText('0', -76, 72);
  context.fillText('5', 0, -73);
  context.fillText('10', 76, 72);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

const label = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
  map: labelTexture(), toneMapped: false,
}));
label.scale.set(1.08, 0.15, 1);
label.position.set(-0.42, 1.105, -0.225);
pumpConsole.add(label);

const levelIndicators = [];
const controlTargets = [];
const controlGroups = [];
const sourceLamps = [];
const tankColumns = [-0.78, -0.42, -0.06];

function addControl(index, direction, x, y) {
  const control = new THREE.Group();
  control.position.set(x + 0.055, y, -0.19);
  control.userData = { index, direction, restZ: -0.19, pulse: 0, pulseDelay: 0 };
  pumpConsole.add(control);

  const button = addBox(control, direction > 0 ? matRaise : matLower,
    0.18, 0.115, 0.065, 0, 0, 0);
  button.name = `door3-tank-${index + 1}-${direction > 0 ? 'inlet' : 'outlet'}`;
  button.userData = {
    controlKind: 'tank', pumpIndex: index, pumpDirection: direction,
  };

  addBox(control, matGlyph, 0.092, 0.014, 0.012, 0, 0, 0.040);
  if (direction > 0)
    addBox(control, matGlyph, 0.014, 0.082, 0.012, 0, 0, 0.041);

  controlTargets.push(button);
  controlGroups.push(control);
}

tankColumns.forEach((x, index) => {
  addBox(pumpConsole, matMetal, 0.066, 0.34, 0.035, x - 0.12, 0.86, -0.205);
  const indicator = addBox(pumpConsole, matLevel, 0.040, 0.20, 0.018,
    x - 0.12, 0.69 + 0.10, -0.18);
  indicator.userData = {
    baseY: 0.69,
    maxHeight: 0.30,
    displayLevel: PUMP_CONSOLE.initialLevels[index],
    targetLevel: PUMP_CONSOLE.initialLevels[index],
  };
  levelIndicators.push(indicator);
  const lamp = addBox(pumpConsole, matSourceLampOff.clone(), 0.055, 0.035, 0.018,
    x - 0.12, 1.075, -0.175);
  lamp.userData.selected = false;
  sourceLamps.push(lamp);

  const target = PUMP_CONSOLE.targetLevels[index];
  if (target !== null) {
    const band = addBox(pumpConsole, matGlyph, 0.084, 0.018, 0.020,
      x - 0.12, 0.69 + 0.30 * target, -0.16);
    band.name = `door3-tank-${index + 1}-target-band`;
  }
  addControl(index, 1, x, 0.965);
  // The old 0.755 centre put the lower half of the button inside the 0.75 m
  // front lip, so its white minus glyph was physically occluded. Keep the
  // whole button above that lip with a small authored safety gap.
  addControl(index, -1, x, LOWER_CONTROL_Y);
});

const gaugeFace = new THREE.Mesh(
  new THREE.CircleGeometry(0.255, 32),
  new THREE.MeshBasicMaterial({ map: gaugeTexture(), toneMapped: false }),
);
gaugeFace.position.set(0.46, 0.91, -0.205);
pumpConsole.add(gaugeFace);
const gaugeRim = new THREE.Mesh(new THREE.TorusGeometry(0.263, 0.018, 8, 32), matMetal);
gaugeRim.position.set(0.46, 0.91, -0.18);
pumpConsole.add(gaugeRim);

const gaugeNeedle = new THREE.Group();
gaugeNeedle.position.set(0.46, 0.91, -0.155);
pumpConsole.add(gaugeNeedle);
addBox(gaugeNeedle, matNeedle, 0.018, 0.19, 0.012, 0, 0.085, 0);
const needleHub = new THREE.Mesh(new THREE.CircleGeometry(0.038, 16), matNeedle);
needleHub.position.z = 0.008;
gaugeNeedle.add(needleHub);

const pressureAngle = ratio => THREE.MathUtils.degToRad(120 - ratio * 240);
let targetPressureRatio = pumpPressureBar(PUMP_CONSOLE.initialVolumes) /
  PUMP_CONSOLE.pressureMaxBar;
gaugeNeedle.rotation.z = pressureAngle(targetPressureRatio);

/* The physical master lever remains locked until both latch pistons retract. */
const masterLever = new THREE.Group();
masterLever.name = 'door3-master-lever';
masterLever.position.set(0.74, 0.78, -0.16);
masterLever.userData = { unlocked: false, pulled: false, displayPull: 0 };
pumpConsole.add(masterLever);
const leverSocket = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.13, 0.09, 12), matMetal);
leverSocket.rotation.x = Math.PI / 2;
masterLever.add(leverSocket);
const leverHandle = addBox(masterLever, matLeverLocked, 0.11, 0.48, 0.10,
  0, 0.20, 0.02);
leverHandle.name = 'door3-master-lever-handle';
leverHandle.userData = { controlKind: 'lever' };
addBox(masterLever, matLower, 0.19, 0.12, 0.14, 0, 0.46, 0.02);
controlTargets.push(leverHandle);

const leverLamp = addBox(pumpConsole, matSourceLampOff.clone(), 0.09, 0.045, 0.025,
  0.74, 1.115, -0.17);
leverLamp.name = 'door3-master-lever-lamp';

export function attachPumpConsole(parent) {
  if (pumpConsole.parent !== parent) parent.add(pumpConsole);
}

export function setPumpConsoleReadout(levels, pressureBar) {
  levelIndicators.forEach((indicator, index) => {
    const level = Number(levels[index]);
    indicator.userData.targetLevel = Math.max(
      PUMP_CONSOLE.minLevel,
      Math.min(PUMP_CONSOLE.maxLevel,
        Number.isFinite(level) ? level : PUMP_CONSOLE.initialLevels[index]),
    );
  });
  const pressure = Number(pressureBar);
  targetPressureRatio = Math.max(0, Math.min(1,
    (Number.isFinite(pressure) ? pressure : 0) / PUMP_CONSOLE.pressureMaxBar));
}

export function setPumpConsoleState({
  selectedSource = null,
  leverUnlocked = false,
  leverPulled = false,
} = {}) {
  sourceLamps.forEach((lamp, index) => {
    const selected = index === selectedSource;
    lamp.userData.selected = selected;
    lamp.material.color.copy((selected ? matSourceLampOn : matSourceLampOff).color);
  });
  masterLever.userData.unlocked = Boolean(leverUnlocked);
  masterLever.userData.pulled = Boolean(leverPulled);
  leverHandle.material = leverUnlocked ? matLeverReady : matLeverLocked;
  leverLamp.material.color.setHex(leverUnlocked ? 0xb5954c : 0x392b20);
}

export function pulsePumpControl(index, direction) {
  const control = controlGroups.find(item =>
    item.userData.index === index && item.userData.direction === Math.sign(direction));
  if (!control) return false;
  // Let the pointing finger arrive before the physical button travels. The
  // game decision still happens immediately; only the visible depression is
  // delayed so hand and control make contact together.
  control.userData.pulse = 0;
  control.userData.pulseDelay = 0.12;
  return true;
}

export function updatePumpConsole(dt) {
  const blend = 1 - Math.exp(-Math.max(0, dt) * 7);
  levelIndicators.forEach(indicator => {
    const data = indicator.userData;
    data.displayLevel += (data.targetLevel - data.displayLevel) * blend;
    const height = data.maxHeight * data.displayLevel;
    indicator.scale.y = height;
    indicator.position.y = data.baseY + height / 2;
  });
  const targetAngle = pressureAngle(targetPressureRatio);
  gaugeNeedle.rotation.z += (targetAngle - gaugeNeedle.rotation.z) * blend;
  controlGroups.forEach(control => {
    if (control.userData.pulseDelay > 0) {
      control.userData.pulseDelay -= dt;
      if (control.userData.pulseDelay <= 0) control.userData.pulse = 1;
    } else {
      control.userData.pulse = Math.max(0, control.userData.pulse - dt * 5);
    }
    control.position.z = control.userData.restZ - control.userData.pulse * 0.025;
  });
  const leverTarget = masterLever.userData.pulled ? 1 : 0;
  masterLever.userData.displayPull +=
    (leverTarget - masterLever.userData.displayPull) * blend;
  masterLever.rotation.z = -masterLever.userData.displayPull * 1.08;
  if (masterLever.userData.unlocked && !masterLever.userData.pulled) {
    const pulse = 0.72 + Math.abs(Math.sin(performance.now() / 380)) * 0.28;
    leverLamp.material.color.setRGB(0.70 * pulse, 0.57 * pulse, 0.28 * pulse);
  }
}

const controlRaycaster = new THREE.Raycaster();
const controlPointer = new THREE.Vector2();
const controlPoint = new THREE.Vector3();

export function pumpControlAtClient(clientX, clientY) {
  if (!pumpConsole.visible || !pumpConsole.parent?.visible) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  controlPointer.set(
    (clientX - rect.left) / rect.width * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  controlRaycaster.setFromCamera(controlPointer, camera);
  const hit = controlRaycaster.intersectObjects(controlTargets, false)[0];
  if (!hit) return null;
  camera.updateWorldMatrix(true, false);
  const handTarget = camera.worldToLocal(hit.point.clone()).toArray();
  const handNormal = (hit.face?.normal?.clone() ?? new THREE.Vector3(0, 0, 1))
    .transformDirection(hit.object.matrixWorld)
    .transformDirection(camera.matrixWorldInverse)
    .normalize()
    .toArray();
  if (hit.object.userData.controlKind === 'lever') return { kind: 'lever' };
  return {
    kind: 'tank',
    index: hit.object.userData.pumpIndex,
    direction: hit.object.userData.pumpDirection,
    handTarget,
    handNormal,
  };
}

function objectCentreClient(target) {
  pumpConsole.updateWorldMatrix(true, true);
  target.getWorldPosition(controlPoint).project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: rect.left + (controlPoint.x + 1) * rect.width / 2,
    y: rect.top + (1 - controlPoint.y) * rect.height / 2,
    ndcX: +controlPoint.x.toFixed(3),
    ndcY: +controlPoint.y.toFixed(3),
    depth: +controlPoint.z.toFixed(3),
    inView: Math.abs(controlPoint.x) <= 1 && Math.abs(controlPoint.y) <= 1 &&
      controlPoint.z >= -1 && controlPoint.z <= 1,
  };
}

export function pumpControlCentreClient(index, direction) {
  const target = controlTargets.find(object =>
    object.userData.pumpIndex === index &&
    object.userData.pumpDirection === Math.sign(direction));
  return target ? objectCentreClient(target) : null;
}

export function pumpGaugeCentreClient() {
  return objectCentreClient(gaugeFace);
}

export function pumpLeverCentreClient() {
  return objectCentreClient(leverHandle);
}
