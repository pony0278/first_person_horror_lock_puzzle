import { describe, expect, it } from 'vitest';
import {
  DOOR3_APPROACH, door3ApproachProgress, door3ApproachZ,
} from '../src/logic/door3-transition';

describe('Door 2 to Door 3 continuous pump-room approach', () => {
  it('opens once and completes one uninterrupted run', () => {
    expect(DOOR3_APPROACH.openSec).toBeGreaterThanOrEqual(0.7);
    expect(DOOR3_APPROACH.runSec).toBeGreaterThan(3);
    expect(DOOR3_APPROACH.throughSec).toBeLessThan(DOOR3_APPROACH.runSec);
  });

  it('starts at Door 2 and ends exactly at the pump-hub centre', () => {
    expect(door3ApproachZ(0, -12.12, 0)).toBe(0);
    expect(door3ApproachZ(0, -12.12, DOOR3_APPROACH.runSec)).toBe(-12.12);
  });

  it('never reverses or jumps at the through-to-walk checkpoint', () => {
    const samples = Array.from({ length: 75 }, (_, i) =>
      door3ApproachZ(0, -12.12, i * 0.05));
    expect(samples.every((value, i) => i === 0 || value <= samples[i - 1]!)).toBe(true);

    const boundary = DOOR3_APPROACH.throughSec;
    const before = door3ApproachZ(0, -12.12, boundary - 0.001);
    const after = door3ApproachZ(0, -12.12, boundary + 0.001);
    expect(Math.abs(after - before)).toBeLessThan(0.02);
  });

  it('clamps delayed and negative frames safely', () => {
    expect(door3ApproachProgress(-1)).toBe(0);
    expect(door3ApproachProgress(99)).toBe(1);
    expect(door3ApproachZ(0, -12.12, -1)).toBe(0);
    expect(door3ApproachZ(0, -12.12, 99)).toBe(-12.12);
  });
});
