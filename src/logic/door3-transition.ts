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

/**
 * Door 3's success path stays physical: after the flood gate clears, the
 * camera aligns with the opening, runs through it, then holds on the safe side
 * before the round result appears.
 */
export const DOOR3_ESCAPE = Object.freeze({
  /** Pump-hub local Z of the flood-gate threshold. */
  gateZ: -7.55,
  /** Camera stopping point, leaving visible corridor beyond the player. */
  endZ: -11.40,
  /** Align with the narrow doorway before reaching its threshold. */
  alignSec: 0.88,
  runSec: 2.15,
  /** Quiet release beat before the success result covers the scene. */
  breatheSec: 2.40,
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

export function door3EscapeProgress(elapsedSec: number): number {
  return smoothstep(clamp01(elapsedSec / DOOR3_ESCAPE.runSec));
}

export function door3EscapeX(elapsedSec: number): number {
  const alignment = smoothstep(clamp01(elapsedSec / DOOR3_ESCAPE.alignSec));
  return DOOR3_OPERATOR.x * (1 - alignment);
}

export function door3EscapeLocalZ(elapsedSec: number): number {
  const progress = door3EscapeProgress(elapsedSec);
  return DOOR3_OPERATOR.z + (DOOR3_ESCAPE.endZ - DOOR3_OPERATOR.z) * progress;
}

export function door3EscapeZ(hubCenterZ: number, elapsedSec: number): number {
  return hubCenterZ + door3EscapeLocalZ(elapsedSec);
}

export function door3EscapeCrossed(elapsedSec: number): boolean {
  return door3EscapeLocalZ(elapsedSec) < DOOR3_ESCAPE.gateZ - 0.20;
}
