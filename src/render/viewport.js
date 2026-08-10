/* 視窗尺寸：把 canvas、相機、暗角與剖面圖的尺寸重新對齊。
   單獨成一個模組是為了打破 halt ⇄ loop 的循環相依 —— context 恢復時
   要重新套一次尺寸，主迴圈也要，兩邊都只是消費者。 */

import * as THREE from 'three';
import { CFG } from '../logic/config.js';
import { effectivePixelRatio } from '../logic/door3-performance.js';
import { view } from '../dom.js';
import { camera, renderer } from './scene.js';
import { vig, vigMat } from './hintwall.js';
import { sizeCut } from './cutaway.js';
import { sizeCircuit } from './circuitboard.js';

let pixelRatioCap = CFG.render.pixelRatio;

function syncProjection() {
  const w = view.clientWidth, h = view.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const d = Math.abs(vig.position.z);
  const vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * d;
  vig.scale.set(vh * camera.aspect * 1.02, vh * 1.02, 1);
  vigMat.uniforms.uAspect.value = camera.aspect;
}

/** Adjust the sprint lens without resizing the drawing buffer every frame. */
export function setCameraFov(fov) {
  if (Math.abs(camera.fov - fov) < 0.01) return;
  camera.fov = fov;
  syncProjection();
}

/** Set a stage-specific DPR cap. The next resize applies it in one buffer allocation. */
export function setRenderPixelRatioCap(cap = CFG.render.pixelRatio) {
  pixelRatioCap = Number.isFinite(cap) && cap > 0 ? cap : CFG.render.pixelRatio;
}

export function renderPixelRatioCap() {
  return pixelRatioCap;
}

export function resize() {
  sizeCut();
  sizeCircuit();
  const w = view.clientWidth, h = view.clientHeight;
  syncProjection();
  const ratio = effectivePixelRatio(devicePixelRatio, pixelRatioCap);
  // setDrawingBufferSize updates logical size, DPR, and the backing buffer in
  // one operation. setPixelRatio()+setSize() would allocate twice exactly when
  // Door 3 expands from the 66% lock view to the full viewport.
  renderer.setDrawingBufferSize(w, h, ratio);
  renderer.domElement.style.width = `${w}px`;
  renderer.domElement.style.height = `${h}px`;
}
addEventListener('resize', resize);
