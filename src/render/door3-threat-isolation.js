/* F2.5R.5 — Threat Isolation Blackout.
 *
 * The player must never run through another fake black wall. Instead, the world
 * is progressively swallowed by real render state while the authored camera
 * turns back: black fog + exposure collapse, followed by a threat-only camera
 * layer. The scene background is already black, so the final read is only the
 * distant face floating in darkness.
 */
import * as THREE from 'three';
import { CFG } from '../logic/config.js';
import {
  DOOR3_THREAT_ISOLATION,
  door3ThreatIsolationStrength,
  door3ThreatOnlyLayer,
} from '../logic/door3-threat-isolation.js';
import { look } from '../state.js';
import './door3-face-separation.js';
import { floodDoor } from './pumphub.js';
import { camera, renderer, scene } from './scene.js';

const baseFogDensity = CFG.fog.density;
const baseFogColour = new THREE.Color(CFG.fog.color);
const blackFogColour = new THREE.Color(0x000000);
const baseExposure = CFG.render.exposure;

let started = false;
let isolated = false;
let getState = null;
let lastStrength = 0;

const previousBeforeRender = scene.onBeforeRender;
const previousAfterRender = scene.onAfterRender;
let savedCameraMask = camera.layers.mask;

function faceObject() {
  return floodDoor.getObjectByName('door3-finale-black-face');
}

function prepareFaceLayer() {
  const face = faceObject();
  if (!face) return false;
  face.layers.enable(DOOR3_THREAT_ISOLATION.threatLayer);
  if (face.material) {
    // The threat is the one thing the blackout must not consume.
    face.material.fog = false;
    face.material.toneMapped = false;
    face.material.needsUpdate = true;
  }
  return true;
}

function currentInput() {
  const state = getState?.();
  return {
    phase: state?.phase,
    yawDeg: look.yaw,
    faceProgress: state?.finale?.faceProgress ?? 0,
  };
}

function applyWorldRenderState() {
  const input = currentInput();
  lastStrength = door3ThreatIsolationStrength(input);
  isolated = door3ThreatOnlyLayer(isolated, input);

  prepareFaceLayer();
  savedCameraMask = camera.layers.mask;

  if (scene.fog?.isFogExp2) {
    scene.fog.density = THREE.MathUtils.lerp(
      baseFogDensity,
      DOOR3_THREAT_ISOLATION.maxFogDensity,
      lastStrength,
    );
    scene.fog.color.copy(baseFogColour).lerp(blackFogColour, lastStrength);
  }

  renderer.toneMappingExposure = baseExposure * THREE.MathUtils.lerp(
    1,
    DOOR3_THREAT_ISOLATION.exposureFloor,
    lastStrength,
  );

  if (isolated) camera.layers.set(DOOR3_THREAT_ISOLATION.threatLayer);
  else camera.layers.set(0);
}

function restoreWorldRenderState() {
  camera.layers.mask = savedCameraMask;
  if (scene.fog?.isFogExp2) {
    scene.fog.density = baseFogDensity;
    scene.fog.color.copy(baseFogColour);
  }
  renderer.toneMappingExposure = baseExposure;
}

export function startDoor3ThreatIsolation(getDoor3State) {
  if (started) return;
  started = true;
  getState = getDoor3State;
  prepareFaceLayer();

  scene.onBeforeRender = function (...args) {
    previousBeforeRender?.apply(this, args);
    applyWorldRenderState();
  };
  scene.onAfterRender = function (...args) {
    restoreWorldRenderState();
    previousAfterRender?.apply(this, args);
  };
}

export function resetDoor3ThreatIsolation() {
  isolated = false;
  lastStrength = 0;
  restoreWorldRenderState();
}

export function door3ThreatIsolationSnapshot() {
  return {
    isolated,
    strength: +lastStrength.toFixed(3),
    layer: DOOR3_THREAT_ISOLATION.threatLayer,
    facePrepared: Boolean(faceObject()?.layers?.isEnabled(
      DOOR3_THREAT_ISOLATION.threatLayer,
    )),
  };
}
