/* 視窗尺寸：把 canvas、相機、暗角與剖面圖的尺寸重新對齊。
   單獨成一個模組是為了打破 halt ⇄ loop 的循環相依 —— context 恢復時
   要重新套一次尺寸，主迴圈也要，兩邊都只是消費者。 */

import * as THREE from 'three';
import { view } from '../dom.js';
import { camera, renderer } from './scene.js';
import { vig, vigMat } from './hintwall.js';
import { sizeCut } from './cutaway.js';
import { sizeCircuit } from './circuitboard.js';

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

export function resize() {
  sizeCut();
  sizeCircuit();
  const w = view.clientWidth, h = view.clientHeight;
  syncProjection();
  renderer.setSize(w, h);
}
addEventListener('resize', resize);
