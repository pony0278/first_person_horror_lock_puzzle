const capacities = Object.freeze([6, 4, 3] as const);
const initialVolumes = Object.freeze([6, 1, 0] as const);
const targetVolumes = Object.freeze([5, null, 2] as const);

export const PUMP_CONSOLE = Object.freeze({
  tankCount: 3,
  minLevel: 0,
  maxLevel: 1,
  pressureMaxBar: 10,
  transferSec: 0.72,
  solveHoldSec: 0.60,
  capacities,
  initialVolumes,
  targetVolumes,
  tankRoles: Object.freeze(['LEFT LATCH', 'RETURN', 'RIGHT LATCH'] as const),
  initialLevels: Object.freeze(initialVolumes.map((volume, index) =>
    volume / capacities[index]!,
  )),
  targetLevels: Object.freeze(targetVolumes.map((volume, index) =>
    volume === null ? null : volume / capacities[index]!,
  )),
});

export type PumpTransferReason =
  'moved' | 'invalid' | 'same-tank' | 'empty-source' | 'full-target';

export interface PumpTransferResult {
  volumes: number[];
  moved: number;
  source: number;
  target: number;
  reason: PumpTransferReason;
}

const clampInt = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(value)));

export function normalizePumpVolumes(volumes: readonly number[]): number[] {
  return Array.from({ length: PUMP_CONSOLE.tankCount }, (_, index) => {
    const value = Number(volumes[index]);
    const fallback = PUMP_CONSOLE.initialVolumes[index]!;
    return clampInt(Number.isFinite(value) ? value : fallback,
      0, PUMP_CONSOLE.capacities[index]!);
  });
}

export function pumpLevelsFromVolumes(volumes: readonly number[]): number[] {
  const normalized = normalizePumpVolumes(volumes);
  return normalized.map((volume, index) =>
    volume / PUMP_CONSOLE.capacities[index]!,
  );
}

/**
 * Pour until the source is empty or the target is full. This is the only
 * operation allowed by the Door 3 puzzle, so the total amount of fluid can
 * never increase or disappear.
 */
export function transferPumpVolume(
  volumes: readonly number[],
  source: number,
  target: number,
): PumpTransferResult {
  const next = normalizePumpVolumes(volumes);
  if (!Number.isInteger(source) || !Number.isInteger(target) ||
      source < 0 || target < 0 ||
      source >= PUMP_CONSOLE.tankCount || target >= PUMP_CONSOLE.tankCount) {
    return { volumes: next, moved: 0, source, target, reason: 'invalid' };
  }
  if (source === target)
    return { volumes: next, moved: 0, source, target, reason: 'same-tank' };
  if (next[source] === 0)
    return { volumes: next, moved: 0, source, target, reason: 'empty-source' };
  const room = PUMP_CONSOLE.capacities[target]! - next[target]!;
  if (room === 0)
    return { volumes: next, moved: 0, source, target, reason: 'full-target' };

  const moved = Math.min(next[source]!, room);
  next[source]! -= moved;
  next[target]! += moved;
  return { volumes: next, moved, source, target, reason: 'moved' };
}

/** Left and right tanks drive the two physical flood-door latches. */
export function pumpLatchStates(volumes: readonly number[]): [boolean, boolean] {
  const normalized = normalizePumpVolumes(volumes);
  return [
    normalized[0] === PUMP_CONSOLE.targetVolumes[0],
    normalized[2] === PUMP_CONSOLE.targetVolumes[2],
  ];
}

export function pumpPuzzleSolved(volumes: readonly number[]): boolean {
  return pumpLatchStates(volumes).every(Boolean);
}

/**
 * The gauge communicates distance to the two latch bands, not average water.
 * It is deliberately advisory: the pistons and white bands remain the source
 * of truth, while the needle becomes more nervous as the answer approaches.
 */
export function pumpPressureRatio(volumes: readonly number[]): number {
  const levels = pumpLevelsFromVolumes(volumes);
  const targets = PUMP_CONSOLE.targetLevels;
  const error = (
    Math.abs(levels[0]! - Number(targets[0])) +
    Math.abs(levels[2]! - Number(targets[2]))
  ) / 2;
  return Math.max(0, Math.min(1, 1 - error));
}

export function pumpPressureBar(volumes: readonly number[]): number {
  return Math.round(pumpPressureRatio(volumes) *
    PUMP_CONSOLE.pressureMaxBar * 10) / 10;
}

export function pumpVolumeTotal(volumes: readonly number[]): number {
  return normalizePumpVolumes(volumes).reduce((sum, volume) => sum + volume, 0);
}
