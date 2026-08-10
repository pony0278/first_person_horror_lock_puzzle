/** Pure timing contract for the Door 2 → Door 3 flashlight reveal. */

export const DOOR3_REVEAL = Object.freeze({
  /** Brief cover used to swap the corridor for the pump hub. */
  coverSec: 0.08,
  /** The player is stationary while the flashlight reveals the new space. */
  revealSec: 0.10,
});

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * The cover is driven by game time, so Debug pause and playback speed cannot
 * drift away from the camera transition.
 */
export function door3CoverOpacity(
  phase: 'cover' | 'reveal',
  elapsedSec: number,
): number {
  const duration = phase === 'cover' ? DOOR3_REVEAL.coverSec : DOOR3_REVEAL.revealSec;
  const progress = clamp01(elapsedSec / duration);
  return phase === 'cover' ? progress : 1 - progress;
}
