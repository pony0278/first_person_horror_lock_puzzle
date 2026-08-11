import type {
  Door3ThreatDirection,
  Door3ThreatSnapshot,
} from './door3-threat.js';
import { DOOR3_THREAT_STEPS } from './door3-threat.js';
import { DOOR3_OPERATOR } from './door3-transition.js';

export interface Door3PursuitStart {
  direction: Door3ThreatDirection;
  distance: number;
  stage: number;
}

export interface Door3PursuitPose {
  x: number;
  z: number;
  yawDeg: number;
}

export interface Door3PursuitInput extends Door3PursuitStart {
  elapsed: number;
  gazeHeld: number;
  playerLocalZ: number;
  crossed: boolean;
}

export interface Door3PursuitSnapshot extends Door3PursuitStart {
  elapsed: number;
  gazeHeld: number;
  effectiveElapsed: number;
  travel: number;
  gap: number;
  visible: boolean;
  lethal: boolean;
  pose: Door3PursuitPose;
}

export const DOOR3_GAZE = Object.freeze({
  /** A corridor counts as watched only when it is clearly centred. */
  toleranceDeg: 34,
  /** Each F2.3 distance stage may be restrained once, but never indefinitely. */
  stageHoldSec: 1.60,
  /** A forced light blink masks the relocation after the hold is exhausted. */
  forcedBlinkSec: 0.18,
});

export const DOOR3_PURSUIT = Object.freeze({
  /** Brief honest reveal beat after the lever's metal report. */
  revealSec: 0.30,
  /** The same actor runs from its current branch, through the hub, to the gate. */
  speed: 2.13,
  /** During gate lift the player gets one final bounded stare restraint. */
  gazeHoldSec: 1.60,
  catchDistance: 0.42,
  /** Closest approach at or below this distance earns the clutch result. */
  clutchDistance: 1.25,
});

const safeNumber = (value: number) => Number.isFinite(value) ? value : 0;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function door3DirectionYaw(direction: Door3ThreatDirection | null): number | null {
  if (direction === 'left') return 90;
  if (direction === 'right') return -90;
  if (direction === 'rear') return 180;
  return null;
}

function angleDistance(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

export function door3GazeAligned(
  yawDeg: number,
  direction: Door3ThreatDirection | null,
  toleranceDeg = DOOR3_GAZE.toleranceDeg,
): boolean {
  const target = door3DirectionYaw(direction);
  if (target === null) return false;
  const tolerance = clamp(safeNumber(toleranceDeg), 0, 90);
  return angleDistance(safeNumber(yawDeg), target) <= tolerance;
}

export function door3GazeHoldDelta(
  snapshot: Pick<Door3ThreatSnapshot, 'direction' | 'monsterVisible'>,
  yawDeg: number,
  heldSec: number,
  deltaSec: number,
  limitSec = DOOR3_GAZE.stageHoldSec,
): number {
  if (!snapshot.monsterVisible ||
      !door3GazeAligned(yawDeg, snapshot.direction)) return 0;
  const held = Math.max(0, safeNumber(heldSec));
  const limit = Math.max(0, safeNumber(limitSec));
  const delta = Math.max(0, safeNumber(deltaSec));
  return Math.min(delta, Math.max(0, limit - held));
}

/** Capture the exact warned corridor and distance when the lever is pulled. */
export function door3PursuitStart(
  snapshot: Pick<Door3ThreatSnapshot, 'direction' | 'distance' | 'stage'>,
): Door3PursuitStart {
  const fallback = DOOR3_THREAT_STEPS[0];
  const stage = Number.isInteger(snapshot.stage) && snapshot.stage >= 0
    ? Math.min(DOOR3_THREAT_STEPS.length - 1, snapshot.stage)
    : 0;
  const authored = DOOR3_THREAT_STEPS[stage] ?? fallback;
  return {
    direction: snapshot.direction ?? authored.direction,
    distance: snapshot.distance ?? authored.distance,
    stage,
  };
}

function pursuitPose(
  direction: Door3ThreatDirection,
  startDistance: number,
  travel: number,
): Door3PursuitPose {
  const remaining = Math.max(0, startDistance - travel);
  if (remaining > 0) {
    if (direction === 'rear') return { x: 0, z: remaining, yawDeg: 0 };
    if (direction === 'left') return { x: -remaining, z: 0, yawDeg: -90 };
    return { x: remaining, z: 0, yawDeg: 90 };
  }
  return { x: 0, z: -(travel - startDistance), yawDeg: 0 };
}

export function door3PursuitAt(input: Door3PursuitInput): Door3PursuitSnapshot {
  const elapsed = Math.max(0, safeNumber(input.elapsed));
  const gazeHeld = clamp(
    safeNumber(input.gazeHeld), 0, DOOR3_PURSUIT.gazeHoldSec,
  );
  const startDistance = Math.max(0, safeNumber(input.distance));
  const effectiveElapsed = Math.max(
    0, elapsed - DOOR3_PURSUIT.revealSec - gazeHeld,
  );
  const travel = effectiveElapsed * DOOR3_PURSUIT.speed;
  const playerForward = Math.max(
    0,
    DOOR3_OPERATOR.z - safeNumber(input.playerLocalZ),
  );
  const gap = Math.max(
    0,
    startDistance + Math.abs(DOOR3_OPERATOR.z) + playerForward - travel,
  );
  const crossed = Boolean(input.crossed);
  return {
    direction: input.direction,
    distance: startDistance,
    stage: input.stage,
    elapsed,
    gazeHeld,
    effectiveElapsed,
    travel,
    gap,
    visible: elapsed >= DOOR3_PURSUIT.revealSec,
    lethal: !crossed && gap <= DOOR3_PURSUIT.catchDistance,
    pose: pursuitPose(input.direction, startDistance, travel),
  };
}
