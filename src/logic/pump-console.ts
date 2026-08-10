export const PUMP_CONSOLE = Object.freeze({
  tankCount: 3,
  minLevel: 0.12,
  maxLevel: 0.96,
  step: 0.08,
  pressureMaxBar: 10,
  initialLevels: Object.freeze([0.74, 0.46, 0.92] as const),
});

const roundLevel = (value: number) => Math.round(value * 100) / 100;

export function normalizePumpLevels(levels: readonly number[]): number[] {
  return Array.from({ length: PUMP_CONSOLE.tankCount }, (_, index) => {
    const value = Number(levels[index]);
    const fallback = PUMP_CONSOLE.initialLevels[index]!;
    return roundLevel(Math.max(
      PUMP_CONSOLE.minLevel,
      Math.min(PUMP_CONSOLE.maxLevel, Number.isFinite(value) ? value : fallback),
    ));
  });
}

export function adjustPumpLevel(
  levels: readonly number[],
  index: number,
  direction: number,
): number[] {
  const next = normalizePumpLevels(levels);
  if (!Number.isInteger(index) || index < 0 || index >= PUMP_CONSOLE.tankCount)
    return next;
  if (!Number.isFinite(direction) || direction === 0) return next;
  next[index] = roundLevel(Math.max(
    PUMP_CONSOLE.minLevel,
    Math.min(PUMP_CONSOLE.maxLevel,
      next[index]! + Math.sign(direction) * PUMP_CONSOLE.step),
  ));
  return next;
}

export function pumpPressureBar(levels: readonly number[]): number {
  const normalized = normalizePumpLevels(levels);
  const mean = normalized.reduce((sum, level) => sum + level, 0) /
    PUMP_CONSOLE.tankCount;
  return Math.round(mean * PUMP_CONSOLE.pressureMaxBar * 10) / 10;
}

export function pumpPressureRatio(levels: readonly number[]): number {
  return pumpPressureBar(levels) / PUMP_CONSOLE.pressureMaxBar;
}
