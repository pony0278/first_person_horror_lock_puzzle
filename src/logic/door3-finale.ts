/** F2.5 / F2.5R — Door 3 false-safety finale timing contract.
 *
 * F2.5R.3 removes the old stand-still face reveal. F2.5R.4 keeps the face at
 * the ruined gate, turns the second escape into a longer endless-corridor run,
 * and ends on loss of consciousness rather than a pursuing-face jumpscare.
 */

export const DOOR3_FINALE = Object.freeze({
  /** Gate starts dropping as soon as the player honestly crosses the threshold. */
  gateCloseSec: 0.58,
  /** Three authored impacts. The third hit is the run-first handoff. */
  impactTimes: Object.freeze([0.18, 0.84, 1.50] as const),
  /** The first bang gives the initial stationary checkback an in-world reason. */
  turnDelaySec: 0.24,
  turnSec: 0.82,

  /** F2.5R.3 — third hit immediately starts the moving reveal sequence. */
  runForwardTurnSec: 0.32,
  runLookBackStartSec: 0.48,
  runLookBackSec: 0.58,
  runLookBackYawDeg: 162,
  runLookBackHoldSec: 0.28,
  runReturnSec: 0.46,
  /** The gate fails after the player has already committed to running away. */
  runBreakAtSec: 0.38,
  breakSec: 0.34,
  /** The face becomes readable only after the damaged leaf has opened into void. */
  runFaceAtSec: 0.72,
  faceRevealSec: 0.50,
  /** Gate-side lamps fail during the shoulder check; forward endless lamps dim separately. */
  runBlackoutAtSec: 0.98,

  /** Legacy gate-side lamp chain. No physical darkness wall follows the player. */
  blackoutLampCount: 7,
  blackoutLeadSec: 0.10,
  blackoutStepSec: 0.22,

  /** F2.5R.4: a longer continuous sprint sells the corridor as effectively endless. */
  secondRunStartSec: 0,
  secondRunSec: 5.20,
  secondRunDistance: 18.00,

  /** The contaminated pool is readable only near the end of the long sprint. */
  slipRevealProgress: 0.84,
  /** A tiny skid beat precedes the actual loss of balance. */
  fallLeadSec: 0.10,
  fallSec: 0.72,
  /** The body keeps sliding forward while the camera drops toward the floor. */
  fallSlideDistance: 0.58,
  fallCameraDrop: 1.02,
  fallRollDeg: -18,
  /** F2.5R.4: the player collapses facing roughly forward and never turns back to the threat. */
  fallTwistDeg: 12,
  groundLookSec: 999,
  /** No monster closes the gap after the fall; these remain compatibility clocks only. */
  groundChaseSec: 999,
  /** Disable the old near-eye flash by scheduling it well after the blackout. */
  eyeFlashAtSec: 999,
  eyeFlashSec: 0.18,
  /** Brief dazed ground beat, then consciousness cuts out. */
  blackoutAtSec: 1.05,
  /** Hold complete darkness before the result text appears. */
  clearDelaySec: 1.00,
} as const);

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};

/** 1 = fully open, 0 = fully slammed shut. */
export function door3FinaleGateOpenRatio(elapsedAfterCrossSec: number): number {
  return 1 - smoothstep(elapsedAfterCrossSec / DOOR3_FINALE.gateCloseSec);
}

/** Number of monster blows the player has already heard/seen (0..3). */
export function door3FinaleImpactCount(elapsedSec: number): number {
  if (!Number.isFinite(elapsedSec)) return 0;
  return DOOR3_FINALE.impactTimes.filter(time => elapsedSec >= time).length;
}

/** Initial checkback: stay forward for the first bang, then turn to 180°. */
export function door3FinaleCheckbackYaw(elapsedSec: number): number {
  const p = smoothstep((elapsedSec - DOOR3_FINALE.turnDelaySec) / DOOR3_FINALE.turnSec);
  return 180 * p;
}

/**
 * F2.5R.3 running shoulder-check choreography.
 * 180° at the third hit → forward to run → shoulder-check 162° → forward again.
 */
export function door3FinaleRunRevealYaw(elapsedRunSec: number): number {
  if (!Number.isFinite(elapsedRunSec) || elapsedRunSec <= 0) return 180;

  if (elapsedRunSec < DOOR3_FINALE.runForwardTurnSec) {
    const p = smoothstep(elapsedRunSec / DOOR3_FINALE.runForwardTurnSec);
    return 180 * (1 - p);
  }

  if (elapsedRunSec < DOOR3_FINALE.runLookBackStartSec) return 0;

  const lookBackEnd = DOOR3_FINALE.runLookBackStartSec + DOOR3_FINALE.runLookBackSec;
  if (elapsedRunSec < lookBackEnd) {
    const p = smoothstep(
      (elapsedRunSec - DOOR3_FINALE.runLookBackStartSec) / DOOR3_FINALE.runLookBackSec,
    );
    return DOOR3_FINALE.runLookBackYawDeg * p;
  }

  const holdEnd = lookBackEnd + DOOR3_FINALE.runLookBackHoldSec;
  if (elapsedRunSec < holdEnd) return DOOR3_FINALE.runLookBackYawDeg;

  const returnEnd = holdEnd + DOOR3_FINALE.runReturnSec;
  if (elapsedRunSec < returnEnd) {
    const p = smoothstep((elapsedRunSec - holdEnd) / DOOR3_FINALE.runReturnSec);
    return DOOR3_FINALE.runLookBackYawDeg * (1 - p);
  }

  return 0;
}

/** Gate rupture begins only after the third-hit escape is already underway. */
export function door3FinaleRunBreakProgress(elapsedRunSec: number): number {
  return smoothstep(
    (elapsedRunSec - DOOR3_FINALE.runBreakAtSec) / DOOR3_FINALE.breakSec,
  );
}

/** Oversized face resolves while the player is physically looking back in motion. */
export function door3FinaleRunFaceProgress(elapsedRunSec: number): number {
  return smoothstep(
    (elapsedRunSec - DOOR3_FINALE.runFaceAtSec) / DOOR3_FINALE.faceRevealSec,
  );
}

/** Local blackout clock; negative pre-blackout time is clamped away. */
export function door3FinaleRunBlackoutClock(elapsedRunSec: number): number {
  if (!Number.isFinite(elapsedRunSec)) return 0;
  return Math.max(0, elapsedRunSec - DOOR3_FINALE.runBlackoutAtSec);
}

/** Number of gate-side lamps that have failed (0..7). */
export function door3FinaleBlackoutLampCount(elapsedSec: number): number {
  if (!Number.isFinite(elapsedSec) || elapsedSec < DOOR3_FINALE.blackoutLeadSec) return 0;
  const count = 1 + Math.floor(
    (elapsedSec - DOOR3_FINALE.blackoutLeadSec) / DOOR3_FINALE.blackoutStepSec + 1e-9,
  );
  return Math.max(0, Math.min(DOOR3_FINALE.blackoutLampCount, count));
}

/** Smooth 0..1 failure progress across the authored gate-side lamp chain. */
export function door3FinaleBlackoutProgress(elapsedSec: number): number {
  const finalLampAt = DOOR3_FINALE.blackoutLeadSec +
    (DOOR3_FINALE.blackoutLampCount - 1) * DOOR3_FINALE.blackoutStepSec;
  return smoothstep(elapsedSec / finalLampAt);
}

export function door3FinaleSecondRunProgress(elapsedSec: number): number {
  return smoothstep(elapsedSec / DOOR3_FINALE.secondRunSec);
}

/** Negative local-Z offset from the first safe-side stop point. */
export function door3FinaleSecondRunOffset(elapsedSec: number): number {
  const progress = door3FinaleSecondRunProgress(elapsedSec);
  return progress <= 0 ? 0 : -DOOR3_FINALE.secondRunDistance * progress;
}

/** Red contamination only becomes an obvious hazard near the sprint endpoint. */
export function door3FinaleSlipProgress(secondRunProgress: number): number {
  return smoothstep(
    (secondRunProgress - DOOR3_FINALE.slipRevealProgress) /
    (1 - DOOR3_FINALE.slipRevealProgress),
  );
}

/** 0..1 body fall after the brief skid lead. */
export function door3FinaleFallProgress(elapsedSec: number): number {
  return smoothstep(
    (elapsedSec - DOOR3_FINALE.fallLeadSec) / DOOR3_FINALE.fallSec,
  );
}

/** Forward slide after the slip, kept inside the recycled corridor. */
export function door3FinaleFallSlideOffset(elapsedSec: number): number {
  const progress = door3FinaleFallProgress(elapsedSec);
  return progress <= 0 ? 0 : -DOOR3_FINALE.fallSlideDistance * progress;
}

/** Fallen camera barely twists; it no longer performs a final monster checkback. */
export function door3FinaleGroundLookYaw(elapsedSec: number): number {
  const p = smoothstep(elapsedSec / DOOR3_FINALE.groundLookSec);
  return DOOR3_FINALE.fallTwistDeg + (180 - DOOR3_FINALE.fallTwistDeg) * p;
}

/** Compatibility progress; R4 keeps it near zero until after consciousness is gone. */
export function door3FinaleGroundChaseProgress(elapsedSec: number): number {
  return smoothstep(elapsedSec / DOOR3_FINALE.groundChaseSec);
}

/** Legacy eye flash remains addressable but is disabled during the actual ending. */
export function door3FinaleEyeFlash(elapsedSec: number): number {
  const local = (elapsedSec - DOOR3_FINALE.eyeFlashAtSec) / DOOR3_FINALE.eyeFlashSec;
  if (!Number.isFinite(local) || local <= 0 || local >= 1) return 0;
  if (local <= 0.42) return smoothstep(local / 0.42);
  return 1 - smoothstep((local - 0.42) / 0.58);
}

export function door3FinaleBlackoutReady(elapsedSec: number): boolean {
  return Number.isFinite(elapsedSec) && elapsedSec >= DOOR3_FINALE.blackoutAtSec;
}

export function door3FinaleClearReady(elapsedBlackSec: number): boolean {
  return Number.isFinite(elapsedBlackSec) && elapsedBlackSec >= DOOR3_FINALE.clearDelaySec;
}
