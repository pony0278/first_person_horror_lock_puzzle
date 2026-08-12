/* Door 3 intact-leaf lifecycle during the finale rupture.
 *
 * `door3-moving-leaf-assembly` owns the flat leaf, rivets, and hand wheel. The
 * deformation rig and broken fragments live elsewhere. Once rupture starts,
 * keeping this intact assembly visible leaves the wheel/rivets floating over
 * the distant black face. Hide the whole intact assembly as soon as fragments
 * take over, and restore it automatically on reset/new round.
 */
import { door3LeafAssemblyVisible } from '../logic/door3-leaf-lifecycle.js';
import { floodDoor } from './pumphub.js';

const leafAssembly = floodDoor.getObjectByName('door3-moving-leaf-assembly');
let started = false;

function applyFrame(state) {
  if (!leafAssembly) return;
  const finale = state?.finale;
  leafAssembly.visible = door3LeafAssemblyVisible({
    active: Boolean(state?.active),
    impactCount: finale?.impactCount ?? 0,
    breakProgress: finale?.breakProgress ?? 0,
  });
}

export function startDoor3LeafAssemblyLifecycle(getDoor3State) {
  if (started || typeof requestAnimationFrame !== 'function') return;
  started = true;
  const frame = () => {
    applyFrame(getDoor3State?.());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function door3LeafAssemblyLifecycleSnapshot() {
  return {
    found: Boolean(leafAssembly),
    visible: Boolean(leafAssembly?.visible),
  };
}
