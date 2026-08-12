import { describe, expect, it } from 'vitest';
import {
  DOOR3_FINALE,
  door3FinaleBlackoutLampCount,
  door3FinaleBlackoutProgress,
  door3FinaleBlackoutReady,
  door3FinaleBreakProgress,
  door3FinaleCheckbackYaw,
  door3FinaleClearReady,
  door3FinaleEscapeYaw,
  door3FinaleEyeFlash,
  door3FinaleFaceProgress,
  door3FinaleFallProgress,
  door3FinaleFallSlideOffset,
  door3FinaleGateOpenRatio,
  door3FinaleGroundChaseProgress,
  door3FinaleGroundLookYaw,
  door3FinaleImpactCount,
  door3FinaleSecondRunOffset,
  door3FinaleSecondRunProgress,
  door3FinaleSlipProgress,
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

  it('reveals the contaminated slip hazard before the fall begins', () => {
    expect(door3FinaleSlipProgress(0)).toBe(0);
    expect(door3FinaleSlipProgress(DOOR3_FINALE.slipRevealProgress)).toBe(0);
    expect(door3FinaleSlipProgress((1 + DOOR3_FINALE.slipRevealProgress) / 2))
      .toBeGreaterThan(0);
    expect(door3FinaleSlipProgress(1)).toBe(1);
  });

  it('drops and slides the player through one continuous physical fall', () => {
    expect(door3FinaleFallProgress(0)).toBe(0);
    expect(door3FinaleFallProgress(DOOR3_FINALE.fallLeadSec)).toBe(0);
    const middle = DOOR3_FINALE.fallLeadSec + DOOR3_FINALE.fallSec / 2;
    expect(door3FinaleFallProgress(middle)).toBeGreaterThan(0);
    expect(door3FinaleFallProgress(middle)).toBeLessThan(1);
    expect(door3FinaleFallSlideOffset(0)).toBe(0);
    expect(door3FinaleFallProgress(DOOR3_FINALE.fallLeadSec + DOOR3_FINALE.fallSec))
      .toBe(1);
    expect(door3FinaleFallSlideOffset(DOOR3_FINALE.fallLeadSec + DOOR3_FINALE.fallSec))
      .toBe(-DOOR3_FINALE.fallSlideDistance);
    expect(DOOR3_FINALE.fallCameraDrop).toBeGreaterThan(0.9);
  });

  it('turns the fallen view back while darkness closes the remaining gap', () => {
    expect(door3FinaleGroundLookYaw(0)).toBe(DOOR3_FINALE.fallTwistDeg);
    expect(door3FinaleGroundLookYaw(DOOR3_FINALE.groundLookSec)).toBe(180);
    expect(door3FinaleGroundChaseProgress(0)).toBe(0);
    expect(door3FinaleGroundChaseProgress(DOOR3_FINALE.groundChaseSec)).toBe(1);
  });

  it('flashes the near eyes briefly before the hard blackout', () => {
    expect(door3FinaleEyeFlash(DOOR3_FINALE.eyeFlashAtSec)).toBe(0);
    expect(door3FinaleEyeFlash(
      DOOR3_FINALE.eyeFlashAtSec + DOOR3_FINALE.eyeFlashSec * 0.42,
    )).toBeGreaterThan(0.95);
    expect(door3FinaleEyeFlash(
      DOOR3_FINALE.eyeFlashAtSec + DOOR3_FINALE.eyeFlashSec,
    )).toBe(0);
    expect(DOOR3_FINALE.eyeFlashAtSec + DOOR3_FINALE.eyeFlashSec)
      .toBeLessThanOrEqual(DOOR3_FINALE.blackoutAtSec);
    expect(door3FinaleBlackoutReady(DOOR3_FINALE.blackoutAtSec - 0.01)).toBe(false);
    expect(door3FinaleBlackoutReady(DOOR3_FINALE.blackoutAtSec)).toBe(true);
  });

  it('holds complete darkness before showing the clear result', () => {
    expect(door3FinaleClearReady(0)).toBe(false);
    expect(door3FinaleClearReady(DOOR3_FINALE.clearDelaySec - 0.01)).toBe(false);
    expect(door3FinaleClearReady(DOOR3_FINALE.clearDelaySec)).toBe(true);
    expect(DOOR3_FINALE.clearDelaySec).toBeGreaterThanOrEqual(0.9);
  });
});
