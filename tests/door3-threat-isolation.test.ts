import { describe, expect, it } from 'vitest';
import {
  DOOR3_THREAT_ISOLATION,
  door3ThreatIsolationStrength,
  door3ThreatOnlyLayer,
} from '../src/logic/door3-threat-isolation';

describe('Door 3 F2.5R.5 threat isolation blackout', () => {
  it('does not darken the world before the authored shoulder-check threshold', () => {
    expect(door3ThreatIsolationStrength({
      phase: 'finale-run2', yawDeg: 0, faceProgress: 1,
    })).toBe(0);
    expect(door3ThreatIsolationStrength({
      phase: 'finale-run2',
      yawDeg: DOOR3_THREAT_ISOLATION.fadeStartYawDeg - 0.01,
      faceProgress: 1,
    })).toBe(0);
  });

  it('ramps environmental darkness between 80 and 115 degrees', () => {
    const middleYaw = (
      DOOR3_THREAT_ISOLATION.fadeStartYawDeg +
      DOOR3_THREAT_ISOLATION.isolateYawDeg
    ) / 2;
    const middle = door3ThreatIsolationStrength({
      phase: 'finale-run2', yawDeg: middleYaw, faceProgress: 1,
    });
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
    expect(door3ThreatIsolationStrength({
      phase: 'finale-run2',
      yawDeg: DOOR3_THREAT_ISOLATION.isolateYawDeg,
      faceProgress: 1,
    })).toBe(1);
  });

  it('cannot erase the environment before the face itself has begun revealing', () => {
    expect(door3ThreatIsolationStrength({
      phase: 'finale-run2', yawDeg: 162, faceProgress: 0,
    })).toBe(0);
    const partial = door3ThreatIsolationStrength({
      phase: 'finale-run2', yawDeg: 162, faceProgress: 0.15,
    });
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1);
  });

  it('enters the threat-only layer only after a deep lookback', () => {
    expect(door3ThreatOnlyLayer(false, {
      phase: 'finale-run2', yawDeg: 114.9, faceProgress: 1,
    })).toBe(false);
    expect(door3ThreatOnlyLayer(false, {
      phase: 'finale-run2',
      yawDeg: DOOR3_THREAT_ISOLATION.isolateYawDeg,
      faceProgress: 1,
    })).toBe(true);
  });

  it('uses return hysteresis so the isolated view cannot flicker near 115 degrees', () => {
    expect(door3ThreatOnlyLayer(true, {
      phase: 'finale-run2', yawDeg: 90, faceProgress: 1,
    })).toBe(true);
    expect(door3ThreatOnlyLayer(true, {
      phase: 'finale-run2',
      yawDeg: DOOR3_THREAT_ISOLATION.restoreYawDeg + 0.01,
      faceProgress: 1,
    })).toBe(true);
    expect(door3ThreatOnlyLayer(true, {
      phase: 'finale-run2',
      yawDeg: DOOR3_THREAT_ISOLATION.restoreYawDeg,
      faceProgress: 1,
    })).toBe(false);
  });

  it('never keeps threat-only rendering after the moving reveal phase ends', () => {
    expect(door3ThreatOnlyLayer(true, {
      phase: 'finale-fall', yawDeg: 162, faceProgress: 1,
    })).toBe(false);
    expect(door3ThreatIsolationStrength({
      phase: 'finale-fall', yawDeg: 162, faceProgress: 1,
    })).toBe(0);
  });
});
