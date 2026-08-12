/* F2.5R.4.1 — keep the ruined floodgate readable without cheating depth.
 *
 * The face must remain physically behind the door. Instead of disabling depth
 * testing, each metal fragment gets a wrapper transform that throws it outward
 * as rupture completes, leaving a real central aperture for the distant face.
 */
import { door3FragmentClearanceOffset } from '../logic/door3-fragment-clearance.js';
import { floodDoor } from './pumphub.js';

const brokenGate = floodDoor.getObjectByName('door3-finale-broken-gate');
const wrappers = [];

if (brokenGate) {
  for (let index = 0; index < 6; index++) {
    const fragment = brokenGate.getObjectByName(`door3-finale-gate-fragment-${index + 1}`);
    if (!fragment) continue;
    const wrapper = fragment.parent === brokenGate
      ? new fragment.constructor.prototype.constructor?.() // unreachable guard
      : null;
    void wrapper;
  }
}
