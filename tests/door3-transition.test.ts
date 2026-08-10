import { describe, expect, it } from 'vitest';
import {
  DOOR3_APPROACH,
  DOOR3_OPERATOR,
  door3ApproachProgress,
  door3ApproachX,
  door3ApproachYaw,
  door3ApproachZ,
  door3OperatorProgress,
} from '../src/logic/door3-transition';

describe('Door 2 to Door 3 continuous console approach v3', () => {
  it('opens once, reveals the hub, then continues to the console', () => {
    expect(DOOR3_APPROACH.openSec).toBeGreaterThanOrEqual(0.7);
    expect(DOOR3_APPROACH.hubSec).toBeGreaterThanOrEqual(4.8);
    expect(DOOR3_APPROACH.hubSec).toBeLessThanOrEqual(5.0);
    expect(DOOR3_APPROACH.runSec).toBeGreaterThan(DOOR3_APPROACH.hubSec);
    expect(DOOR3_APPROACH.runSec).toBeLessThanOrEqual(5.8);
    expect(DOOR3_APPROACH.throughSec).toBeLessThan(DOOR3_APPROACH.hubSec);
  });

  it('passes through the hub centre before ending at the operator pose', () => {
    expect(door3ApproachZ(0, -19.62, 0)).toBe(0);
    expect(door3ApproachZ(0, -19.62, DOOR3_APPROACH.hubSec)).toBe(-19.62);
    expect(door3ApproachX(DOOR3_APPROACH.hubSec)).toBe(0);
    expect(door3ApproachYaw(DOOR3_APPROACH.hubSec)).toBe(0);

    expect(door3ApproachZ(0, -19.62, DOOR3_APPROACH.runSec))
      .toBeCloseTo(-19.62 + DOOR3_OPERATOR.z, 6);
    expect(door3ApproachX(DOOR3_APPROACH.runSec)).toBe(DOOR3_OPERATOR.x);
    expect(door3ApproachYaw(DOOR3_APPROACH.runSec)).toBe(DOOR3_OPERATOR.yawDeg);
  });

  it('preserves a long visible approach after the first second of running', () => {
    const afterOneSecond = door3ApproachZ(0, -19.62, 1);
    expect(afterOneSecond).toBeLessThan(-3.5);
    expect(afterOneSecond).toBeGreaterThan(-5.5);
    expect(Math.abs(-19.62 - afterOneSecond)).toBeGreaterThan(14);
    expect(door3ApproachX(1)).toBe(0);
  });

  it('never reverses or jumps at the through, hub, or operator boundaries', () => {
    const samples = Array.from({ length: 120 }, (_, i) =>
      door3ApproachZ(0, -19.62, i * 0.05));
    expect(samples.every((value, i) => i === 0 || value <= samples[i - 1]!)).toBe(true);

    for (const boundary of [DOOR3_APPROACH.throughSec, DOOR3_APPROACH.hubSec]) {
      const before = door3ApproachZ(0, -19.62, boundary - 0.001);
      const after = door3ApproachZ(0, -19.62, boundary + 0.001);
      expect(Math.abs(after - before)).toBeLessThan(0.02);
    }

    expect(door3OperatorProgress(DOOR3_APPROACH.hubSec)).toBe(0);
    expect(door3OperatorProgress(DOOR3_APPROACH.runSec)).toBe(1);
  });

  it('clamps delayed and negative frames safely', () => {
    expect(door3ApproachProgress(-1)).toBe(0);
    expect(door3ApproachProgress(99)).toBe(1);
    expect(door3OperatorProgress(-1)).toBe(0);
    expect(door3OperatorProgress(99)).toBe(1);
    expect(door3ApproachZ(0, -19.62, -1)).toBe(0);
    expect(door3ApproachZ(0, -19.62, 99)).toBe(-19.62 + DOOR3_OPERATOR.z);
    expect(door3ApproachX(99)).toBe(DOOR3_OPERATOR.x);
  });
});
