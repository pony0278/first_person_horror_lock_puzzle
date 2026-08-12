/** F2.5R.2 — deterministic plastic deformation for the Door 3 floodgate. */

export type Door3MetalSurface = 'monster' | 'safe';

export interface Door3MetalImpact {
  x: number;
  y: number;
  radius: number;
  depth: number;
  seed: number;
  foldAngle: number;
}

/** Coordinates are relative to the 2.10 × 2.38m leaf centre. */
export const DOOR3_METAL_IMPACTS = Object.freeze([
  { x: -0.36, y: 0.38, radius: 0.46, depth: 0.155, seed: 1.73, foldAngle: 0.42 },
  { x:  0.39, y: -0.03, radius: 0.53, depth: 0.185, seed: 4.11, foldAngle: 2.18 },
  { x: -0.08, y: -0.52, radius: 0.61, depth: 0.225, seed: 7.47, foldAngle: 1.16 },
] as const satisfies readonly Door3MetalImpact[]);

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth01 = (value: number) => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};

/**
 * Brief elastic overshoot followed by permanent plastic set. This mirrors the
 * supplied metal-dent reference: hit → rebound → smaller counter-rebound → set.
 */
export function door3MetalImpactFactor(ageSec: number): number {
  if (!Number.isFinite(ageSec) || ageSec <= 0) return 0;
  if (ageSec < 0.052) return smooth01(ageSec / 0.052) * 1.13;
  if (ageSec < 0.125) {
    const q = smooth01((ageSec - 0.052) / 0.073);
    return 1.13 + (0.89 - 1.13) * q;
  }
  if (ageSec < 0.23) {
    const q = smooth01((ageSec - 0.125) / 0.105);
    return 0.89 + (1.018 - 0.89) * q;
  }
  if (ageSec < 0.31) {
    const q = smooth01((ageSec - 0.23) / 0.08);
    return 1.018 + (1 - 1.018) * q;
  }
  return 1;
}

/**
 * Positive profile magnitude. The final world/local Z direction is supplied by
 * door3MetalDisplacement(): the monster strikes from +Z toward the safe -Z side.
 */
export function door3MetalProfile(
  dx: number,
  dy: number,
  impact: Door3MetalImpact,
  surface: Door3MetalSurface,
): number {
  const isImpact = surface === 'monster';
  const radius = impact.radius * (isImpact ? 1 : 1.16);
  const verticalRadius = radius * (isImpact ? 0.86 : 0.93);
  const angle = Math.atan2(dy, dx);
  const angularWarp = 1 +
    Math.sin(angle * 3 + impact.seed * 1.7) * 0.065 +
    Math.sin(angle * 7 + impact.seed * 0.83) * 0.028 +
    Math.sin(angle * 12 + impact.seed * 1.9) * 0.011;
  const r = Math.sqrt(
    (dx * dx) / (radius * radius) +
    (dy * dy) / (verticalRadius * verticalRadius),
  ) * angularWarp;
  if (r > 1.18) return 0;

  const amp = impact.depth * (isImpact ? 1 : 0.82);
  let bowl = 0;
  if (r < 1) bowl = amp * Math.pow(1 - r * r, isImpact ? 2.05 : 1.55);

  const rim = amp * (isImpact ? 0.22 : 0.11) *
    Math.exp(-Math.pow((r - (isImpact ? 0.77 : 0.83)) / (isImpact ? 0.105 : 0.15), 2));
  const crease = amp * (isImpact ? 0.045 : 0.022) *
    Math.sin(r * (isImpact ? 37 : 29) + angle * 4 + impact.seed) *
    Math.exp(-Math.pow((r - 0.72) / 0.31, 2));
  const axis = Math.cos(angle - impact.foldAngle);
  const fold = amp * (isImpact ? 0.032 : 0.015) * Math.pow(Math.abs(axis), 8) *
    Math.sin(r * 21 + impact.seed * 2.7) *
    Math.exp(-Math.pow((r - 0.5) / 0.38, 2));

  return bowl - rim + crease + fold;
}

/**
 * Signed local-Z displacement. Both skins travel toward -Z because the blow
 * comes from the monster side (+Z): monster skin becomes a crater while the
 * safe-side skin becomes the corresponding outward bulge.
 */
export function door3MetalDisplacement(
  x: number,
  y: number,
  surface: Door3MetalSurface,
  impactAgesSec: readonly number[],
): number {
  let displacement = 0;
  for (let index = 0; index < DOOR3_METAL_IMPACTS.length; index++) {
    const factor = door3MetalImpactFactor(impactAgesSec[index] ?? -1);
    if (factor <= 0) continue;
    const impact = DOOR3_METAL_IMPACTS[index];
    displacement -= door3MetalProfile(x - impact.x, y - impact.y, impact, surface) * factor;
  }
  return displacement;
}
