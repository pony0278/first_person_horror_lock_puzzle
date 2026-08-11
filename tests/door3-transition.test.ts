import { describe, expect, it } from 'vitest';
import {
  DOOR3_APPROACH,
  DOOR3_ESCAPE,
  DOOR3_OPERATOR,
  door3ApproachProgress,
  door3ApproachX,
  door3ApproachYaw,
  door3ApproachZ,
  door3EscapeCrossed,
  door3EscapeLocalZ,
  door3EscapeProgress,
  door3EscapeX,
  door3EscapeZ,
  door3OperatorProgress,
} from '../src/logic/door3-transition';

describe('Door 2 to Door 3 crossroads hold and console approach v4', () => {
  it('opens once, reveals the hub, pauses, then walks to the console', () => {
    expect(DOOR3_APPROACH.openSec).toBeGreaterThanOrEqual(0.7);
    expect(DOOR3_APPROACH.hubSec).toBeGreaterThanOrEqual(4.8);
    expect(DOOR3_APPROACH.hubSec).toBeLessThanOrEqual(5.0);
    expect(DOOR3_APPROACH.runSec).toBeGreaterThan(DOOR3_APPROACH.hubSec);
    expect(DOOR3_APPROACH.crossHoldSec).toBeGreaterThanOrEqual(0.6);
    expect(DOOR3_APPROACH.consoleSec).toBeGreaterThanOrEqual(1);
    expect(DOOR3_APPROACH.runSec).toBeLessThanOrEqual(6.9);
    expect(DOOR3_APPROACH.throughSec).toBeLessThan(DOOR3_APPROACH.hubSec);
  });

  it('passes through the hub centre before ending at the operator pose', () => {
    const operatorStart = DOOR3_APPROACH.hubSec + DOOR3_APPROACH.crossHoldSec;
    expect(door3ApproachZ(0, -19.62, 0)).toBe(0);
    expect(door3ApproachZ(0, -19.62, DOOR3_APPROACH.hubSec)).toBe(-19.62);
    expect(door3ApproachX(DOOR3_APPROACH.hubSec)).toBe(0);
    expect(door3ApproachYaw(DOOR3_APPROACH.hubSec)).toBe(0);
    expect(door3ApproachZ(0, -19.62, operatorStart)).toBe(-19.62);
    expect(door3ApproachX(operatorStart)).toBe(0);
    expect(door3ApproachYaw(operatorStart)).toBe(0);

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

    const operatorStart = DOOR3_APPROACH.hubSec + DOOR3_APPROACH.crossHoldSec;
    for (const boundary of [
      DOOR3_APPROACH.throughSec, DOOR3_APPROACH.hubSec, operatorStart,
    ]) {
      const before = door3ApproachZ(0, -19.62, boundary - 0.001);
      const after = door3ApproachZ(0, -19.62, boundary + 0.001);
      expect(Math.abs(after - before)).toBeLessThan(0.02);
    }

    expect(door3OperatorProgress(DOOR3_APPROACH.hubSec)).toBe(0);
    expect(door3OperatorProgress(operatorStart)).toBe(0);
    expect(door3OperatorProgress(DOOR3_APPROACH.runSec)).toBe(1);
  });

  it('keeps the entire crossroads hold stationary before the centred approach', () => {
    const midpoint = DOOR3_APPROACH.hubSec + DOOR3_APPROACH.crossHoldSec / 2;
    expect(door3ApproachX(midpoint)).toBe(0);
    expect(door3ApproachZ(0, -19.62, midpoint)).toBe(-19.62);
    expect(door3ApproachYaw(midpoint)).toBe(0);
    expect(DOOR3_OPERATOR.x).toBe(-1.4);
    expect(DOOR3_OPERATOR.yawDeg).toBe(0);
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

describe('Door 3 physical escape completion path', () => {
  it('runs through the flood gate before a two-to-three-second release beat', () => {
    expect(DOOR3_ESCAPE.runSec).toBeGreaterThanOrEqual(1.8);
    expect(DOOR3_ESCAPE.runSec).toBeLessThanOrEqual(2.5);
    expect(DOOR3_ESCAPE.breatheSec).toBeGreaterThanOrEqual(2);
    expect(DOOR3_ESCAPE.breatheSec).toBeLessThanOrEqual(3);
    expect(DOOR3_ESCAPE.endZ).toBeLessThan(DOOR3_ESCAPE.gateZ - 2);
  });

  it('starts at the operator, aligns to the door, and ends beyond the threshold', () => {
    expect(door3EscapeX(0)).toBe(DOOR3_OPERATOR.x);
    expect(door3EscapeLocalZ(0)).toBe(DOOR3_OPERATOR.z);
    expect(door3EscapeZ(-19.62, 0)).toBe(-19.62 + DOOR3_OPERATOR.z);

    expect(door3EscapeX(DOOR3_ESCAPE.alignSec)).toBeCloseTo(0, 6);
    expect(door3EscapeX(DOOR3_ESCAPE.runSec)).toBeCloseTo(0, 6);
    expect(door3EscapeLocalZ(DOOR3_ESCAPE.runSec)).toBe(DOOR3_ESCAPE.endZ);
    expect(door3EscapeCrossed(DOOR3_ESCAPE.runSec)).toBe(true);
  });

  it('never reverses and is centred before it crosses the physical gate', () => {
    const samples = Array.from({ length: 216 }, (_, i) => i * 0.01);
    const positions = samples.map(door3EscapeLocalZ);
    expect(positions.every((value, i) => i === 0 || value <= positions[i - 1]!)).toBe(true);

    const crossing = samples.find(door3EscapeCrossed);
    expect(crossing).toBeDefined();
    expect(Math.abs(door3EscapeX(crossing!))).toBeLessThan(0.01);
  });

  it('clamps negative and delayed frames safely', () => {
    expect(door3EscapeProgress(-1)).toBe(0);
    expect(door3EscapeProgress(99)).toBe(1);
    expect(door3EscapeX(-1)).toBe(DOOR3_OPERATOR.x);
    expect(door3EscapeLocalZ(-1)).toBe(DOOR3_OPERATOR.z);
    expect(door3EscapeLocalZ(99)).toBe(DOOR3_ESCAPE.endZ);
  });
});
