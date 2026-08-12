/** F2.5R.5 — isolate the Door 3 face inside true rendered darkness.
 *
 * No black geometry is created. The environment first disappears into dense
 * black fog / low exposure while the player turns back, then the camera switches
 * to a threat-only layer so the world is not rendered at all. Hysteresis keeps
 * the camera layer from flickering while the authored shoulder-check reverses.
 */

export const DOOR3_THREAT_ISOLATION = Object.freeze({
  fadeStartYawDeg: 80,
  isolateYawDeg: 115,
  restoreYawDeg: 55,
  minFaceProgress: 0.02,
  fullFaceProgress: 0.30,
  threatLayer: 3,
  maxFogDensity: 1.85,
  exposureFloor: 0.10,
});

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};

export interface Door3ThreatIsolationInput {
  phase?: string | null;
  yawDeg?: number;
  faceProgress?: number;
}

/**
 * 0 = authored corridor appearance, 1 = environment should read as black.
 * Face reveal participates in the ramp so the world cannot vanish before there
 * is actually a threat for the player to read inside the darkness.
 */
export function door3ThreatIsolationStrength({
  phase,
  yawDeg = 0,
  faceProgress = 0,
}: Door3ThreatIsolationInput): number {
  if (phase !== 'finale-run2') return 0;
  if (!Number.isFinite(yawDeg) || !Number.isFinite(faceProgress)) return 0;

  const face = smoothstep(
    (faceProgress - DOOR3_THREAT_ISOLATION.minFaceProgress) /
      (DOOR3_THREAT_ISOLATION.fullFaceProgress - DOOR3_THREAT_ISOLATION.minFaceProgress),
  );
  const yaw = smoothstep(
    (Math.abs(yawDeg) - DOOR3_THREAT_ISOLATION.fadeStartYawDeg) /
      (DOOR3_THREAT_ISOLATION.isolateYawDeg - DOOR3_THREAT_ISOLATION.fadeStartYawDeg),
  );
  return clamp01(face * yaw);
}

/**
 * Camera-layer hysteresis. Enter only once the player has genuinely turned far
 * enough toward the threat; remain isolated until the return swing is clearly
 * facing the escape corridor again.
 */
export function door3ThreatOnlyLayer(
  wasIsolated: boolean,
  { phase, yawDeg = 0, faceProgress = 0 }: Door3ThreatIsolationInput,
): boolean {
  if (phase !== 'finale-run2') return false;
  if (!Number.isFinite(yawDeg) || !Number.isFinite(faceProgress)) return false;
  if (faceProgress < DOOR3_THREAT_ISOLATION.minFaceProgress) return false;

  const yaw = Math.abs(yawDeg);
  if (wasIsolated) return yaw > DOOR3_THREAT_ISOLATION.restoreYawDeg;
  return yaw >= DOOR3_THREAT_ISOLATION.isolateYawDeg &&
    faceProgress >= DOOR3_THREAT_ISOLATION.fullFaceProgress;
}
