/* F2.5R.4.1 — keep the ruined floodgate readable without cheating depth.
 *
 * The face remains physically behind the door. Instead of disabling depth
 * testing, each metal fragment gets a wrapper transform that throws it outward
 * as rupture completes, leaving a real central aperture for the distant face.
 */
import * as THREE from 'three';
import { door3FragmentClearanceOffset } from '../logic/door3-fragment-clearance.js';
import { floodDoor } from './pumphub.js';

const brokenGate = floodDoor.getObjectByName('door3-finale-broken-gate');
const wrappers = [];

if (brokenGate) {
  for (let index = 0; index < 6; index++) {
    const fragment = brokenGate.getObjectByName(`door3-finale-gate-fragment-${index + 1}`);
    if (!fragment || fragment.parent !== brokenGate) continue;

    const wrapper = new THREE.Group();
    wrapper.name = `door3-finale-fragment-clearance-${index + 1}`;
    brokenGate.add(wrapper);
    brokenGate.remove(fragment);
    wrapper.add(fragment);
    wrappers.push({ index, wrapper });
  }
}

let started = false;

function resetWrappers() {
  wrappers.forEach(({ wrapper }) => {
    wrapper.position.set(0, 0, 0);
    wrapper.rotation.set(0, 0, 0);
  });
}

function applyFrame(state) {
  if (!state?.active) {
    resetWrappers();
    return;
  }

  const breakProgress = Math.max(0, Math.min(1, state.finale?.breakProgress ?? 0));
  wrappers.forEach(({ index, wrapper }) => {
    const offset = door3FragmentClearanceOffset(index, breakProgress);
    wrapper.position.set(offset.x, offset.y, offset.z);
    wrapper.rotation.z = offset.rz;
  });
}

export function startDoor3FragmentClearance(getDoor3State) {
  if (started || typeof requestAnimationFrame !== 'function') return;
  started = true;
  const frame = () => {
    applyFrame(getDoor3State?.());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function door3FragmentClearanceSnapshot() {
  return wrappers.map(({ wrapper }, index) => ({
    index,
    x: +wrapper.position.x.toFixed(3),
    y: +wrapper.position.y.toFixed(3),
    z: +wrapper.position.z.toFixed(3),
  }));
}

resetWrappers();
