/** Pure timing contract for the continuous Door 2 → Door 3 approach. */

export const DOOR3_APPROACH = Object.freeze({
  /** Door 2 opens completely before the player commits to the flooded hall. */
  openSec: 0.78,
  /** The early part of the same run, while the camera crosses the threshold. */
  throughSec: 0.58,
  /** Total uninterrupted run from Door 2 to the pump-hub centre. */
  runSec: 3.70,
  /** Residual head-bob settles after the player reaches the hub. */
  settleSec: 0.46,
});

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * The whole run uses one curve even though Debug exposes a `through` and a
 * `walk` checkpoint. That keeps speed and position continuous at the label
 * boundary instead of stitching together two camera moves.
 */
export function door3ApproachProgress(elapsedSec: number): number {
  const progress = clamp01(elapsedSec / DOOR3_APPROACH.runSec);
  return 1 - Math.pow(1 - progress, 1.12);
}

export function door3ApproachZ(
  startZ: number,
  hubCenterZ: number,
  elapsedSec: number,
): number {
  const progress = door3ApproachProgress(elapsedSec);
  return startZ + (hubCenterZ - startZ) * progress;
}
