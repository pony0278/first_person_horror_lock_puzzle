import { describe, expect, it } from 'vitest';
import {
  DOOR3_APPROACH, door3ApproachProgress, door3ApproachZ,
} from '../src/logic/door3-transition';

describe('Door 2 to Door 3 long continuous pump-room approach v2', () => {
  it('opens once and completes one uninterrupted run', () => {
    expect(DOOR3_APPROACH.openSec).toBeGreaterThanOrEqual(0.7);
    expect(DOOR3_APPROACH.runSec).toBeGreaterThanOrEqual(4.8);
    expect(DOOR3_APPROACH.runSec).toBeLessThanOrEqual(5.0);
    expect(DOOR3_APPROACH.throughSec).toBeLessThan(DOOR3_APPROACH.runSec);
  });

  it('starts at Door 2 and ends exactly at the pump-hub centre', () => {
    expect(door3ApproachZ(0, -19.62, 0)).toBe(0);
    expect(door3ApproachZ(0, -19.62, DOOR3_APPROACH.runSec)).toBe(-19.62);
  });

  it('preserves a long visible approach after the first second of running', () => {
    const afterOneSecond = door3ApproachZ(0, -19.62, 1);
    expect(afterOneSecond).toBeLessThan(-3.5);
    expect(afterOneSecond).toBeGreaterThan(-5.5);
    expect(Math.abs(-19.62 - afterOneSecond)).toBeGreaterThan(14);
  });

  it('never reverses or jumps at the through-to-walk checkpoint', () => {
    const samples = Array.from({ length: 100 }, (_, i) =>
      door3ApproachZ(0, -19.62, i * 0.05));
    expect(samples.every((value, i) => i === 0 || value <= samples[i - 1]!)).toBe(true);

    const boundary = DOOR3_APPROACH.throughSec;
    const before = door3ApproachZ(0, -19.62, boundary - 0.001);
    const after = door3ApproachZ(0, -19.62, boundary + 0.001);
    expect(Math.abs(after - before)).toBeLessThan(0.02);
  });

  it('clamps delayed and negative frames safely', () => {
    expect(door3ApproachProgress(-1)).toBe(0);
    expect(door3ApproachProgress(99)).toBe(1);
    expect(door3ApproachZ(0, -19.62, -1)).toBe(0);
    expect(door3ApproachZ(0, -19.62, 99)).toBe(-19.62);
  });
});
