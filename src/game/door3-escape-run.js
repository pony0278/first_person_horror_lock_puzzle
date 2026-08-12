/* F2.5R.1 — Dedicated Escape Run.
 *
 * Door 3 already owns the physical operator → floodgate path in door3.js. The
 * bug was that it reused intro.phase='run', so the shared Door 1 intro machine
 * saw the same flag on the next frame and replayed its hint-wall glance,
 * slow-motion, and corridor position curve over the top of Door 3.
 *
 * This tiny companion claims that phase before the shared loop can consume it.
 * It deliberately leaves intro.active=true: the lower puzzle panel stays hidden
 * and input remains cinematic, while Door 3 remains the sole writer of x/z,
 * head bob, FOV, and forward look during the sprint.
 *
 * Door 1's procedural hand rig selects its authored running pose from
 * anim.handsOverride='run'. The dedicated Door 3 phase is intentionally not the
 * generic intro.phase='run', so claim that same hand pose explicitly while this
 * companion owns the escape. This restores the alternating arm swing without
 * re-enabling Door 1's old hint-wall / slow-motion state machine.
 */
import { anim, intro, look } from '../state.js';

export const DOOR3_ESCAPE_INTRO_PHASE = 'door3-escape-run';

let started = false;
let activeRound = false;
let ownsRunHands = false;

function releaseRunHands() {
  if (ownsRunHands && anim.handsOverride === 'run') anim.handsOverride = null;
  ownsRunHands = false;
}

function applyFrame(state) {
  if (!state?.active) {
    releaseRunHands();
    activeRound = false;
    return;
  }

  if (state.phase !== 'escape') {
    releaseRunHands();
    activeRound = false;
    return;
  }

  activeRound = true;
  intro.phase = DOOR3_ESCAPE_INTRO_PHASE;
  intro.arriveF = 0;
  look.holding = false;
  look.target = 0;
  anim.timeScale = 1;
  anim.handsOverride = 'run';
  ownsRunHands = true;
}

export function startDoor3DedicatedEscapeRun(getDoor3State) {
  if (started || typeof requestAnimationFrame !== 'function') return;
  started = true;
  const frame = () => {
    applyFrame(getDoor3State?.());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function door3DedicatedEscapeRunActive(state) {
  return Boolean(activeRound && state?.active && state.phase === 'escape' &&
    intro.phase === DOOR3_ESCAPE_INTRO_PHASE);
}
