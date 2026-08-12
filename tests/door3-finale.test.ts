import { describe, expect, it } from 'vitest';
import {
  DOOR3_FINALE,
  door3FinaleBlackoutLampCount,
  door3FinaleBlackoutProgress,
  door3FinaleBreakProgress,
  door3FinaleCheckbackYaw,
  door3FinaleEscapeYaw,
  door3FinaleFaceProgress,
  door3FinaleGateOpenRatio,
  door3FinaleImpactCount,
  door3FinaleSecondRunOffset,
  door3FinaleSecondRunProgress,
} from '../src/logic/door3-finale';

describe('Door 3 F2.5 false-safety finale', () => {
  it('slams the floodgate only after crossing and closes monotonically', () => {
    const samples = [0, 0.12, 0.28, DOOR3_FINALE.gateCloseSec]
      .map(door3FinaleGateOpenRatio);
    expect(samples[0]).toBe(1);
    expect(samples.at(-1)).toBe(0);
    for (let i = 1; i < samples.length; i++)
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]!);
  });

  it('authors exactly three escalating impacts before the rupture', () => {
    expect(door3FinaleImpactCount(0)).toBe(0);
    expect(door3FinaleImpactCount(DOOR3_FINALE.impactTimes[0])).toBe(1);
    expect(door3FinaleImpactCount(DOOR3_FINALE.impactTimes[1])).toBe(2);
    expect(door3FinaleImpactCount(DOOR3_FINALE.impactTimes[2])).toBe(3);
    expect(DOOR3_FINALE.breakAtSec).toBeGreaterThan(DOOR3_FINALE.impactTimes[2]);
  });

  it('does not turn the player until the first bang has supplied a reason', () => {
    expect(door3FinaleCheckbackYaw(0)).toBe(0);
    expect(door3FinaleCheckbackYaw(DOOR3_FINALE.impactTimes[0])).toBe(0);
    expect(door3FinaleCheckbackYaw(DOOR3_FINALE.turnDelaySec + DOOR3_FINALE.turnSec))
      .toBe(180);
  });

  it('breaks the gate after the third impact instead of popping instantly', () => {
    expect(door3FinaleBreakProgress(DOOR3_FINALE.impactTimes[2])).toBe(0);
    expect(door3FinaleBreakProgress(DOOR3_FINALE.breakAtSec)).toBe(0);
    expect(door3FinaleBreakProgress(DOOR3_FINALE.breakAtSec + DOOR3_FINALE.breakSec))
      .toBe(1);
  });

  it('resolves the black face gradually from darkness', () => {
    expect(door3FinaleFaceProgress(0)).toBe(0);
    expect(door3FinaleFaceProgress(DOOR3_FINALE.faceRevealSec / 2)).toBeGreaterThan(0);
    expect(door3FinaleFaceProgress(DOOR3_FINALE.faceRevealSec)).toBe(1);
    expect(DOOR3_FINALE.faceHoldSec).toBeGreaterThan(DOOR3_FINALE.faceRevealSec);
  });

  it('kills corridor lamps one-by-one from the broken gate toward the player', () => {
    expect(door3FinaleBlackoutLampCount(0)).toBe(0);
    expect(door3FinaleBlackoutLampCount(DOOR3_FINALE.blackoutLeadSec)).toBe(1);
    expect(door3FinaleBlackoutLampCount(
      DOOR3_FINALE.blackoutLeadSec + DOOR3_FINALE.blackoutStepSec * 2,
    )).toBe(3);
    expect(door3FinaleBlackoutLampCount(
      DOOR3_FINALE.blackoutLeadSec +
      DOOR3_FINALE.blackoutStepSec * (DOOR3_FINALE.blackoutLampCount - 1),
    )).toBe(DOOR3_FINALE.blackoutLampCount);
    expect(door3FinaleBlackoutProgress(0)).toBe(0);
    expect(door3FinaleBlackoutProgress(10)).toBe(1);
  });

  it('turns away only after the blackout has already advanced', () => {
    expect(door3FinaleEscapeYaw(0)).toBe(180);
    expect(door3FinaleEscapeYaw(DOOR3_FINALE.escapeTurnStartSec)).toBe(180);
    expect(door3FinaleBlackoutLampCount(DOOR3_FINALE.escapeTurnStartSec))
      .toBeGreaterThanOrEqual(3);
    expect(door3FinaleEscapeYaw(
      DOOR3_FINALE.escapeTurnStartSec + DOOR3_FINALE.escapeTurnSec,
    )).toBe(0);
  });

  it('runs a second physical escape for the full authored corridor distance', () => {
    expect(door3FinaleSecondRunProgress(0)).toBe(0);
    expect(door3FinaleSecondRunOffset(0)).toBe(0);
    const half = door3FinaleSecondRunOffset(DOOR3_FINALE.secondRunSec / 2);
    expect(half).toBeLessThan(0);
    expect(half).toBeGreaterThan(-DOOR3_FINALE.secondRunDistance);
    expect(door3FinaleSecondRunProgress(DOOR3_FINALE.secondRunSec)).toBe(1);
    expect(door3FinaleSecondRunOffset(DOOR3_FINALE.secondRunSec))
      .toBe(-DOOR3_FINALE.secondRunDistance);
  });
});
