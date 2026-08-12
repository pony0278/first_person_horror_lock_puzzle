/** F2.5R.4 — pure contract for the looping Door 3 escape corridor. */

export const DOOR3_ENDLESS_CORRIDOR = Object.freeze({
  /** The authored extension currently ends here in floodgate-local Z. */
  firstStartZ: -13.45,
  chunkLength: 5.40,
  chunkCount: 6,
  /** Recycle only after the entire chunk is comfortably behind the camera. */
  recycleMargin: 1.10,
  /** Further generations and later run progress become progressively dimmer. */
  baseBrightness: 0.96,
  generationFade: 0.055,
  runFade: 0.24,
  minBrightness: 0.075,
} as const);

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function door3EndlessChunkInitialCenter(index: number): number {
  const safeIndex = Math.max(0, Math.trunc(Number(index) || 0));
  return DOOR3_ENDLESS_CORRIDOR.firstStartZ -
    DOOR3_ENDLESS_CORRIDOR.chunkLength * (safeIndex + 0.5);
}

export interface Door3EndlessRecycleResult {
  centerZ: number;
  wraps: number;
}

/**
 * Running is toward negative Z. Once a chunk's far edge is behind the player,
 * wrap it one full corridor span forward. No end-cap is ever required.
 */
export function door3EndlessRecycle(
  centerZ: number,
  playerZ: number,
): Door3EndlessRecycleResult {
  let next = Number.isFinite(centerZ) ? centerZ : door3EndlessChunkInitialCenter(0);
  const player = Number.isFinite(playerZ) ? playerZ : 0;
  const half = DOOR3_ENDLESS_CORRIDOR.chunkLength / 2;
  const span = DOOR3_ENDLESS_CORRIDOR.chunkLength * DOOR3_ENDLESS_CORRIDOR.chunkCount;
  let wraps = 0;

  while (next - half > player + DOOR3_ENDLESS_CORRIDOR.recycleMargin) {
    next -= span;
    wraps += 1;
  }
  return { centerZ: next, wraps };
}

/** Bright but readable near the gate, sparse/dim deeper into the endless hall. */
export function door3EndlessBrightness(
  generation: number,
  runProgress: number,
): number {
  const g = Math.max(0, Math.trunc(Number(generation) || 0));
  const p = clamp01(Number(runProgress) || 0);
  return Math.max(
    DOOR3_ENDLESS_CORRIDOR.minBrightness,
    DOOR3_ENDLESS_CORRIDOR.baseBrightness -
      g * DOOR3_ENDLESS_CORRIDOR.generationFade -
      p * DOOR3_ENDLESS_CORRIDOR.runFade,
  );
}
