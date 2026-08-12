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
 */
import { anim, intro, look } from '../state.js';

export const DOOR3_ESCAPE_INTRO_PHASE = 'door3-escape-run';

let started = false;
let activeRound = false;

function applyFrame(state) {
  if (!state?.active) {
    activeRound = false;
    return;
  }

  if (state.phase !== 'escape') {
    activeRound = false;
    return;
  }

  activeRound = true;
  intro.phase = DOOR3_ESCAPE_INTRO_PHASE;
  intro.arriveF = 0;
  look.holding = false;
  look.target = 0;
  anim.timeScale = 1;
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
