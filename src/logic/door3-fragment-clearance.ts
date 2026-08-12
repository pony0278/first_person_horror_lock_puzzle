/** Door 3 rupture fragment clearance.
 *
 * The legacy six-piece breakup only nudged each 1m-wide fragment by ~0.1-0.2m,
 * so the pieces still tiled the floodgate opening and occluded the distant face.
 * R4.1 keeps real depth testing and physically clears the centre instead.
 */

export const DOOR3_FRAGMENT_CLEARANCE = Object.freeze({
  startProgress: 0.06,
  fullProgress: 0.78,
  /** Extra wrapper offsets after the legacy per-fragment rupture motion. */
  offsets: Object.freeze([
    Object.freeze({ x: -0.98, y: -0.62, z: -0.10, rz: -0.16 }),
    Object.freeze({ x:  1.02, y: -0.56, z: -0.12, rz:  0.14 }),
    Object.freeze({ x: -1.12, y: -0.08, z: -0.14, rz: -0.11 }),
    Object.freeze({ x:  1.12, y:  0.04, z: -0.15, rz:  0.12 }),
    Object.freeze({ x: -0.98, y:  0.62, z: -0.11, rz: -0.14 }),
    Object.freeze({ x:  1.02, y:  0.68, z: -0.13, rz:  0.16 }),
  ]),
} as const);

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};

/** 0..1 extra clearance layered on top of the existing fragment breakup. */
export function door3FragmentClearanceProgress(breakProgress: number): number {
  if (!Number.isFinite(breakProgress)) return 0;
  const span = DOOR3_FRAGMENT_CLEARANCE.fullProgress -
    DOOR3_FRAGMENT_CLEARANCE.startProgress;
  return smoothstep((breakProgress - DOOR3_FRAGMENT_CLEARANCE.startProgress) / span);
}

export function door3FragmentClearanceOffset(
  fragmentIndex: number,
  breakProgress: number,
) {
  const def = DOOR3_FRAGMENT_CLEARANCE.offsets[fragmentIndex];
  if (!def) return { x: 0, y: 0, z: 0, rz: 0 };
  const p = door3FragmentClearanceProgress(breakProgress);
  return {
    x: def.x * p,
    y: def.y * p,
    z: def.z * p,
    rz: def.rz * p,
  };
}
