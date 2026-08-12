import { describe, expect, it } from 'vitest';
import {
  DOOR3_FRAGMENT_CLEARANCE,
  door3FragmentClearanceOffset,
  door3FragmentClearanceProgress,
} from '../src/logic/door3-fragment-clearance';

describe('Door 3 rupture fragment clearance', () => {
  it('does not move wrappers before rupture visibly starts', () => {
    expect(door3FragmentClearanceProgress(0)).toBe(0);
    expect(door3FragmentClearanceProgress(DOOR3_FRAGMENT_CLEARANCE.startProgress)).toBe(0);
  });

  it('fully clears before the black face is fully readable', () => {
    expect(door3FragmentClearanceProgress(DOOR3_FRAGMENT_CLEARANCE.fullProgress)).toBe(1);
    expect(DOOR3_FRAGMENT_CLEARANCE.fullProgress).toBeLessThan(1);
  });

  it('throws the middle pair far enough sideways to open the centre sightline', () => {
    const left = door3FragmentClearanceOffset(2, 1);
    const right = door3FragmentClearanceOffset(3, 1);
    expect(left.x).toBeLessThanOrEqual(-1.1);
    expect(right.x).toBeGreaterThanOrEqual(1.1);
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(0);
  });

  it('fans the lower and upper rows vertically instead of leaving a metal grid', () => {
    const lowerLeft = door3FragmentClearanceOffset(0, 1);
    const lowerRight = door3FragmentClearanceOffset(1, 1);
    const upperLeft = door3FragmentClearanceOffset(4, 1);
    const upperRight = door3FragmentClearanceOffset(5, 1);
    expect(lowerLeft.y).toBeLessThan(-0.5);
    expect(lowerRight.y).toBeLessThan(-0.5);
    expect(upperLeft.y).toBeGreaterThan(0.5);
    expect(upperRight.y).toBeGreaterThan(0.5);
  });

  it('returns a safe zero offset for an invalid fragment index', () => {
    expect(door3FragmentClearanceOffset(99, 1)).toEqual({ x: 0, y: 0, z: 0, rz: 0 });
  });
});
