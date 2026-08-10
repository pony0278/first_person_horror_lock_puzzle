/** Pure timing contract for the continuous Door 2 → Door 3 approach. */

export const DOOR3_APPROACH = Object.freeze({
  /** Door 2 opens completely before the player commits to the flooded hall. */
  openSec: 0.78,
  /** The early part of the same run, while the camera crosses the threshold. */
  throughSec: 0.34,
  /** Time spent on the straight run from Door 2 to the pump-hub centre. */
  hubSec: 4.90,
  /** Still beat at the crossroads, so the room reveal has time to register. */
  crossHoldSec: 0.70,
  /** Slower walk from the crossroads to the console operation line. */
  consoleSec: 1.12,
  /** Total movement sequence, including the crossroads hold. */
  runSec: 6.72,
  /** Residual head-bob settles after the player reaches the console. */
  settleSec: 0.42,
});

/** Operator pose in pump-hub local coordinates. */
export const DOOR3_OPERATOR = Object.freeze({
  x: -1.40,
  z: -0.25,
  yawDeg: 0,
});

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => value * value * (3 - 2 * value);

/**
 * The hall run stops at the hub centre. A separate operator curve starts only
 * after the crossroads hold, so the reveal is a real stationary beat.
 */
export function door3ApproachProgress(elapsedSec: number): number {
  const progress = clamp01(elapsedSec / DOOR3_APPROACH.hubSec);
  return 1 - Math.pow(1 - progress, 1.08);
}

/** Final walk to the centred, straight-on console operation line. */
export function door3OperatorProgress(elapsedSec: number): number {
  const start = DOOR3_APPROACH.hubSec + DOOR3_APPROACH.crossHoldSec;
  return smoothstep(clamp01((elapsedSec - start) / DOOR3_APPROACH.consoleSec));
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
