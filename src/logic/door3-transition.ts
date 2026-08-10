/** Pure timing contract for the continuous Door 2 → Door 3 approach. */

export const DOOR3_APPROACH = Object.freeze({
  /** Door 2 opens completely before the player commits to the flooded hall. */
  openSec: 0.78,
  /** The early part of the same run, while the camera crosses the threshold. */
  throughSec: 0.34,
  /** Time spent on the straight run from Door 2 to the pump-hub centre. */
  hubSec: 4.90,
  /** Total run, including the final left-forward move to the console. */
  runSec: 5.64,
  /** Residual head-bob settles after the player reaches the console. */
  settleSec: 0.42,
});

/** Operator pose in pump-hub local coordinates. */
export const DOOR3_OPERATOR = Object.freeze({
  x: -0.62,
  z: -0.25,
  yawDeg: 21.5,
});

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => value * value * (3 - 2 * value);

/**
 * The whole run uses one curve even though Debug exposes through, walk,
 * and cross checkpoints. The final leg bends left only after the camera has
 * reached the hub centre, so the intersection remains a readable reveal point.
 */
export function door3ApproachProgress(elapsedSec: number): number {
  const progress = clamp01(elapsedSec / DOOR3_APPROACH.hubSec);
  return 1 - Math.pow(1 - progress, 1.08);
}

/** Final left-forward leg after the camera crosses the hub centre. */
export function door3OperatorProgress(elapsedSec: number): number {
  const span = DOOR3_APPROACH.runSec - DOOR3_APPROACH.hubSec;
  return smoothstep(clamp01((elapsedSec - DOOR3_APPROACH.hubSec) / span));
}

export function door3ApproachZ(
  startZ: number,
  hubCenterZ: number,
  elapsedSec: number,
): number {
  const progress = door3ApproachProgress(elapsedSec);
  return startZ + (hubCenterZ - startZ) * progress +
    DOOR3_OPERATOR.z * door3OperatorProgress(elapsedSec);
}

export function door3ApproachX(elapsedSec: number): number {
  const progress = door3OperatorProgress(elapsedSec);
  return progress === 0 ? 0 : DOOR3_OPERATOR.x * progress;
}

export function door3ApproachYaw(elapsedSec: number): number {
  return DOOR3_OPERATOR.yawDeg * door3OperatorProgress(elapsedSec);
}
