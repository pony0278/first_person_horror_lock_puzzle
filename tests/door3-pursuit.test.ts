import { describe, expect, it } from 'vitest';
import {
  DOOR3_GAZE,
  DOOR3_PURSUIT,
  door3DirectionYaw,
  door3GazeAligned,
  door3GazeHoldDelta,
  door3PursuitAt,
  door3PursuitStart,
} from '../src/logic/door3-pursuit';
import { door3ThreatAt } from '../src/logic/door3-threat';
import { DOOR3_OPERATOR } from '../src/logic/door3-transition';

describe('Door 3 bounded gaze restraint', () => {
  it('maps the three authored corridors and accepts rear yaw wrapping', () => {
    expect(door3DirectionYaw('left')).toBe(90);
    expect(door3DirectionYaw('right')).toBe(-90);
    expect(door3DirectionYaw('rear')).toBe(180);
    expect(door3GazeAligned(91, 'left')).toBe(true);
    expect(door3GazeAligned(-179, 'rear')).toBe(true);
    expect(door3GazeAligned(0, 'rear')).toBe(false);
    expect(door3GazeAligned(-90, 'left')).toBe(false);
  });

  it('holds only a visible actor and never exceeds the per-stage budget', () => {
    const cue = door3ThreatAt(4.0);
    const visible = door3ThreatAt(4.7);
    expect(door3GazeHoldDelta(cue, 180, 0, 0.5)).toBe(0);
    expect(door3GazeHoldDelta(visible, 0, 0, 0.5)).toBe(0);
    expect(door3GazeHoldDelta(visible, 180, 0, 0.5)).toBe(0.5);
    expect(door3GazeHoldDelta(
      visible, 180, DOOR3_GAZE.stageHoldSec - 0.05, 0.5,
    )).toBeCloseTo(0.05, 6);
  });
});

describe('Door 3 lever-to-threshold pursuit', () => {
  const snapshot = (overrides = {}) => ({
    elapsed: 0,
    gazeHeld: 0,
    playerLocalZ: DOOR3_OPERATOR.z,
    crossed: false,
    direction: 'rear' as const,
    distance: 9.3,
    stage: 0,
    ...overrides,
  });

  it('starts in the exact F2.3 corridor and falls back honestly before cue one', () => {
    expect(door3PursuitStart(door3ThreatAt(17.7)))
      .toEqual({ direction: 'right', distance: 7.2, stage: 2 });
    expect(door3PursuitStart(door3ThreatAt(0)))
      .toEqual({ direction: 'rear', distance: 9.3, stage: 0 });
  });

  it('uses a short reveal beat before the actor begins running', () => {
    const hidden = door3PursuitAt(snapshot({ elapsed: DOOR3_PURSUIT.revealSec / 2 }));
    const revealed = door3PursuitAt(snapshot({ elapsed: DOOR3_PURSUIT.revealSec }));
    expect(hidden.visible).toBe(false);
    expect(hidden.travel).toBe(0);
    expect(revealed.visible).toBe(true);
    expect(revealed.travel).toBe(0);
  });

  it('runs from a side corridor through the hub and then toward the flood gate', () => {
    const side = door3PursuitAt(snapshot({
      direction: 'left', distance: 4.3, stage: 4, elapsed: 1.3,
    }));
    expect(side.pose.x).toBeLessThan(0);
    expect(side.pose.z).toBe(0);

    const throughHub = door3PursuitAt(snapshot({
      direction: 'left', distance: 4.3, stage: 4, elapsed: 2.8,
    }));
    expect(throughHub.pose.x).toBe(0);
    expect(throughHub.pose.z).toBeLessThan(0);
    expect(throughHub.pose.yawDeg).toBe(0);
  });

  it('lets an early solver survive the gate lift without requiring a stare', () => {
    const openingEnd = door3PursuitAt(snapshot({ elapsed: 2.7 }));
    expect(openingEnd.lethal).toBe(false);
    expect(openingEnd.gap).toBeGreaterThan(DOOR3_PURSUIT.clutchDistance);
  });

  it('makes a terminal-stage escape require the final bounded stare', () => {
    const noStare = door3PursuitAt(snapshot({
      direction: 'right', distance: 2.7, stage: 5, elapsed: 2.7,
    }));
    expect(noStare.lethal).toBe(true);

    const held = door3PursuitAt(snapshot({
      direction: 'right', distance: 2.7, stage: 5, elapsed: 2.7,
      gazeHeld: DOOR3_PURSUIT.gazeHoldSec,
    }));
    expect(held.lethal).toBe(false);
    expect(held.gap).toBeLessThanOrEqual(DOOR3_PURSUIT.clutchDistance);
  });

  it('locks survival at the physical threshold and never kills across it', () => {
    const threshold = door3PursuitAt(snapshot({
      direction: 'right', distance: 2.7, stage: 5, elapsed: 4.1,
      gazeHeld: DOOR3_PURSUIT.gazeHoldSec,
      playerLocalZ: -7.8,
      crossed: true,
    }));
    expect(threshold.lethal).toBe(false);
    expect(threshold.gap).toBeGreaterThan(0);
  });
});
