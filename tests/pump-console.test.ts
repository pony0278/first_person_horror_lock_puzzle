import { describe, expect, it } from 'vitest';
import {
  PUMP_CONSOLE, adjustPumpLevel, normalizePumpLevels,
  pumpPressureBar, pumpPressureRatio,
} from '../src/logic/pump-console';

describe('Door 3 pump console', () => {
  it('starts with three bounded tank levels and a readable pressure', () => {
    const levels = normalizePumpLevels(PUMP_CONSOLE.initialLevels);
    expect(levels).toEqual([0.74, 0.46, 0.92]);
    expect(pumpPressureBar(levels)).toBe(7.1);
    expect(pumpPressureRatio(levels)).toBeCloseTo(0.71);
  });

  it('adjusts only the selected tank in fixed physical steps', () => {
    expect(adjustPumpLevel([0.74, 0.46, 0.92], 1, 1))
      .toEqual([0.74, 0.54, 0.92]);
    expect(adjustPumpLevel([0.74, 0.54, 0.92], 1, -1))
      .toEqual([0.74, 0.46, 0.92]);
  });

  it('clamps empty and full tanks without wrapping', () => {
    expect(adjustPumpLevel([0.12, 0.46, 0.92], 0, -1)[0])
      .toBe(PUMP_CONSOLE.minLevel);
    expect(adjustPumpLevel([0.74, 0.46, 0.96], 2, 1)[2])
      .toBe(PUMP_CONSOLE.maxLevel);
  });

  it('normalizes malformed input and ignores invalid controls', () => {
    expect(normalizePumpLevels([Number.NaN, -2, 4]))
      .toEqual([0.74, 0.12, 0.96]);
    expect(adjustPumpLevel([0.74, 0.46, 0.92], 8, 1))
      .toEqual([0.74, 0.46, 0.92]);
    expect(adjustPumpLevel([0.74, 0.46, 0.92], 1, 0))
      .toEqual([0.74, 0.46, 0.92]);
  });
});
