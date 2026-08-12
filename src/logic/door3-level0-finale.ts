/** F2.5R.6 — optimized Level 0 noclip finale.
 *
 * The authored Door 3 chase still owns the rupture / face / shoulder-check beats.
 * Once the player has turned forward and run a little farther, the corridor cuts
 * to black with no fall animation. A lightweight Level 0 tableau appears for a
 * short cliffhanger, then the game ends on black.
 */

export const DOOR3_LEVEL0_FINALE = Object.freeze({
  /** Trigger after the moving face reveal has fully returned to forward view. */
  noclipAtRunSec: 3.00,
  /** Hard black before the new space appears. */
  blackHoldSec: 0.48,
  /** Fluorescent hum begins slightly before the image returns. */
  humLeadSec: 0.26,
  /** Tiny eye-open transition; this is not a portal or travel animation. */
  revealSec: 0.12,
  /** Short static cliffhanger only — Level 0 is not playable yet. */
  level0HoldSec: 2.20,
  /** Fade the Level 0 tableau back to black. */
  outroFadeSec: 0.24,
  /** Keep black briefly before result text. */
  clearDelaySec: 0.30,

  /** Dedicated render layer shared by all lightweight Level 0 objects. */
  layer: 4,
  /** Performance contract for the cinematic tableau. */
  textureSize: 256,
  wallInstances: 16,
  fixtureInstances: 8,
  realLights: 3,
} as const);

export function door3Level0NoclipReady(elapsedRunSec: number): boolean {
  return Number.isFinite(elapsedRunSec) &&
    elapsedRunSec >= DOOR3_LEVEL0_FINALE.noclipAtRunSec;
}

export function door3Level0HumReady(elapsedBlackSec: number): boolean {
  return Number.isFinite(elapsedBlackSec) &&
    elapsedBlackSec >= DOOR3_LEVEL0_FINALE.humLeadSec;
}

export function door3Level0RevealReady(elapsedBlackSec: number): boolean {
  return Number.isFinite(elapsedBlackSec) &&
    elapsedBlackSec >= DOOR3_LEVEL0_FINALE.blackHoldSec;
}

export function door3Level0OutroReady(elapsedLevel0Sec: number): boolean {
  return Number.isFinite(elapsedLevel0Sec) &&
    elapsedLevel0Sec >= DOOR3_LEVEL0_FINALE.level0HoldSec;
}

export function door3Level0CompleteReady(elapsedOutroSec: number): boolean {
  return Number.isFinite(elapsedOutroSec) &&
    elapsedOutroSec >= DOOR3_LEVEL0_FINALE.outroFadeSec +
      DOOR3_LEVEL0_FINALE.clearDelaySec;
}
