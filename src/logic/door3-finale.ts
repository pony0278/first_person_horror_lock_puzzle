/** F2.5 — False Safety Finale timing contract.
 *
 * F2.5.1 closes and deforms the floodgate, F2.5.2 reveals the oversized face,
 * and F2.5.3 turns that reveal into a corridor blackout followed by a second
 * physical escape run. F2.5.4 will replace the temporary post-run completion
 * with the authored fall and final glimpse.
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
  /** Temporary release beat until F2.5.4 replaces it with the fall. */
  secondRunSettleSec: 0.55,
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
    (elapsedSec - DOOR3_FINALE.blackoutLeadSec) / DOOR3_FINALE.blackoutStepSec,
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
  return -DOOR3_FINALE.secondRunDistance * door3FinaleSecondRunProgress(elapsedSec);
}
