/* Door 3 black-plane hard cleanup.
 *
 * F2.5R.4 originally hid the old finite-corridor end caps every frame. That was
 * not sufficient: the base Pump Hub still owned its original `escapeVoid`, and
 * the legacy finale renderer could also make its darkness planes visible again.
 *
 * Remove these objects from the scene graph entirely. The endless corridor now
 * supplies real geometry ahead of the player; darkness is expressed only by
 * progressively dimmer lamps/materials, never by a wall the camera can cross.
 */
import '../render/door3-finale.js';
import '../render/door3-face-separation.js';
import { startDoor3FragmentClearance } from '../render/door3-fragment-clearance.js';
import { startDoor3LeafAssemblyLifecycle } from '../render/door3-leaf-lifecycle.js';
import { floodDoor, pumpHub } from '../render/pumphub.js';
import { D3 } from './door3.js';

export const DOOR3_REMOVED_BLACK_OBJECTS = Object.freeze([
  'door3-escape-void',
  'door3-finale-extension-dark-end',
  'door3-finale-advancing-darkness',
  'door3-finale-black-void',
]);

function removeNamed(root, name) {
  const object = root.getObjectByName?.(name);
  if (!object) return false;
  // Do not dispose here: `door3-escape-void` shares boxGeo/matDark with other
  // Pump Hub meshes. Detaching the object is enough to guarantee it can never
  // render while preserving those shared GPU resources.
  object.parent?.remove(object);
  return true;
}

export function removeDoor3LegacyBlackPlanes() {
  const removed = [];
  for (const name of DOOR3_REMOVED_BLACK_OBJECTS) {
    if (removeNamed(pumpHub, name) || removeNamed(floodDoor, name)) removed.push(name);
  }
  return removed;
}

// Static-module evaluation happens after pumphub.js and door3-finale.js have
// constructed their rigs, so removal here is deterministic and happens before
// the first gameplay frame.
removeDoor3LegacyBlackPlanes();
startDoor3FragmentClearance(() => D3);
startDoor3LeafAssemblyLifecycle(() => D3);
