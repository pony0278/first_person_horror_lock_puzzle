/** F2.5 — False Safety Finale timing contract.
 *
 * F2.5.1 closes and deforms the floodgate, F2.5.2 reveals the oversized face,
 * F2.5.3 turns that reveal into a corridor blackout followed by a second
 * physical escape run, and F2.5.4 ends on a contaminated-water fall, one final
 * ground-level glimpse, hard blackout, and delayed clear result.
 */

export const DOOR3_FINALE = Object.freeze({
  /** Gate starts dropping as soon as the player honestly crosses the threshold. */
  gateCloseSec: 0.58,
  /** Three authored impacts: first causes the checkback, last precedes rupture. */
  impactTimes: Object.freeze([0.18, 0.84, 1.50] as const),
  /** The camera turns only after the first impact gives it a reason. */
  turnDelaySec: 0.24,
  turnSec: 0.82,
  /** Quiet metal-tension beat after the third impact. */
  breakAtSec: 2.08,
  breakSec: 0.34,
  /** Face resolves from chromatic noise instead of popping on instantly. */
  faceRevealSec: 0.82,
  faceHoldSec: 1.90,

  /** F2.5.3: darkness walks from the broken gate toward the player lamp-by-lamp. */
  blackoutLampCount: 7,
  blackoutLeadSec: 0.16,
  blackoutStepSec: 0.22,
  /** The player only turns away once multiple lights have already died behind them. */
  escapeTurnStartSec: 0.62,
  escapeTurnSec: 0.50,
  /** Running starts during the final part of the turn instead of after a dead pause. */
  secondRunStartSec: 1.04,
  secondRunSec: 2.55,
  /** Added physical corridor beyond the old stop point. */
  secondRunDistance: 8.40,

  /** F2.5.4: the red pool becomes readable only near the end of the sprint. */
  slipRevealProgress: 0.72,
  /** A tiny skid beat precedes the actual loss of balance. */
  fallLeadSec: 0.10,
  fallSec: 0.72,
  /** The body keeps sliding forward while the camera drops toward the floor. */
  fallSlideDistance: 0.58,
  fallCameraDrop: 1.02,
  fallRollDeg: -18,
  /** The fallen body twists only slightly; the ground beat then looks back. */
  fallTwistDeg: 34,
  groundLookSec: 0.46,
  /** Darkness reaches the fallen player within roughly one second. */
  groundChaseSec: 0.92,
  /** Final near-eye flash is deliberately brief. */
  eyeFlashAtSec: 0.70,
  eyeFlashSec: 0.18,
  blackoutAtSec: 0.92,
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

/** Cinematic checkback: stay forward for the first bang, then turn to 180°. */
export function door3FinaleCheckbackYaw(elapsedSec: number): number {
  const p = smoothstep((elapsedSec - DOOR3_FINALE.turnDelaySec) / DOOR3_FINALE.turnSec);
  return 180 * p;
}

export function door3FinaleBreakProgress(elapsedSec: number): number {
  return smoothstep((elapsedSec - DOOR3_FINALE.breakAtSec) / DOOR3_FINALE.breakSec);
}

export function door3FinaleFaceProgress(elapsedSec: number): number {
  return smoothstep(elapsedSec / DOOR3_FINALE.faceRevealSec);
}

/** Number of corridor lamps swallowed by the advancing darkness (0..7). */
export function door3FinaleBlackoutLampCount(elapsedSec: number): number {
  if (!Number.isFinite(elapsedSec) || elapsedSec < DOOR3_FINALE.blackoutLeadSec) return 0;
  const count = 1 + Math.floor(
    (elapsedSec - DOOR3_FINALE.blackoutLeadSec) / DOOR3_FINALE.blackoutStepSec + 1e-9,
  );
  return Math.max(0, Math.min(DOOR3_FINALE.blackoutLampCount, count));
}

/** Smooth 0..1 advance of the darkness front across the authored lamp chain. */
export function door3FinaleBlackoutProgress(elapsedSec: number): number {
  const finalLampAt = DOOR3_FINALE.blackoutLeadSec +
    (DOOR3_FINALE.blackoutLampCount - 1) * DOOR3_FINALE.blackoutStepSec;
  return smoothstep(elapsedSec / finalLampAt);
}

/** 180° (watching the face) returns to 0° only after several lamps go dark. */
export function door3FinaleEscapeYaw(elapsedSec: number): number {
  const p = smoothstep(
    (elapsedSec - DOOR3_FINALE.escapeTurnStartSec) / DOOR3_FINALE.escapeTurnSec,
  );
  return 180 * (1 - p);
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

/** Forward slide after the slip, kept inside the authored corridor extension. */
export function door3FinaleFallSlideOffset(elapsedSec: number): number {
  const progress = door3FinaleFallProgress(elapsedSec);
  return progress <= 0 ? 0 : -DOOR3_FINALE.fallSlideDistance * progress;
}

/** Fallen camera turns from the partial body twist to a full look back. */
export function door3FinaleGroundLookYaw(elapsedSec: number): number {
  const p = smoothstep(elapsedSec / DOOR3_FINALE.groundLookSec);
  return DOOR3_FINALE.fallTwistDeg + (180 - DOOR3_FINALE.fallTwistDeg) * p;
}

/** Darkness/face closes the remaining ground-level gap. */
export function door3FinaleGroundChaseProgress(elapsedSec: number): number {
  return smoothstep(elapsedSec / DOOR3_FINALE.groundChaseSec);
}

/** Very brief overexposed eye flash immediately before the hard cut to black. */
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
