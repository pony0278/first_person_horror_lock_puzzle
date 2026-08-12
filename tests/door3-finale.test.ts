import { describe, expect, it } from 'vitest';
import {
  DOOR3_FINALE,
  door3FinaleBlackoutLampCount,
  door3FinaleBlackoutProgress,
  door3FinaleBlackoutReady,
  door3FinaleCheckbackYaw,
  door3FinaleClearReady,
  door3FinaleEyeFlash,
  door3FinaleFallProgress,
  door3FinaleFallSlideOffset,
  door3FinaleGateOpenRatio,
  door3FinaleGroundChaseProgress,
  door3FinaleGroundLookYaw,
  door3FinaleImpactCount,
  door3FinaleRunBlackoutClock,
  door3FinaleRunBreakProgress,
  door3FinaleRunFaceProgress,
  door3FinaleRunRevealYaw,
  door3FinaleSecondRunOffset,
  door3FinaleSecondRunProgress,
  door3FinaleSlipProgress,
} from '../src/logic/door3-finale';

describe('Door 3 F2.5 / F2.5R false-safety finale', () => {
  it('slams the floodgate only after crossing and closes monotonically', () => {
    const samples = [0, 0.12, 0.28, DOOR3_FINALE.gateCloseSec]
      .map(door3FinaleGateOpenRatio);
    expect(samples[0]).toBe(1);
    expect(samples.at(-1)).toBe(0);
    for (let i = 1; i < samples.length; i++)
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]!);
  });

  it('authors exactly three escalating impacts and uses the third as the run handoff', () => {
    expect(door3FinaleImpactCount(0)).toBe(0);
    expect(door3FinaleImpactCount(DOOR3_FINALE.impactTimes[0])).toBe(1);
    expect(door3FinaleImpactCount(DOOR3_FINALE.impactTimes[1])).toBe(2);
    expect(door3FinaleImpactCount(DOOR3_FINALE.impactTimes[2])).toBe(3);
    expect(DOOR3_FINALE.secondRunStartSec).toBe(0);
  });

  it('does not perform the initial checkback until the first bang supplies a reason', () => {
    expect(door3FinaleCheckbackYaw(0)).toBe(0);
    expect(door3FinaleCheckbackYaw(DOOR3_FINALE.impactTimes[0])).toBe(0);
    expect(door3FinaleCheckbackYaw(DOOR3_FINALE.turnDelaySec + DOOR3_FINALE.turnSec))
      .toBe(180);
  });

  it('turns forward immediately after hit three, then shoulder-checks while still running', () => {
    expect(door3FinaleRunRevealYaw(0)).toBe(180);
    expect(door3FinaleRunRevealYaw(DOOR3_FINALE.runForwardTurnSec)).toBe(0);
    expect(door3FinaleRunRevealYaw(DOOR3_FINALE.runLookBackStartSec)).toBe(0);

    const lookBackEnd = DOOR3_FINALE.runLookBackStartSec + DOOR3_FINALE.runLookBackSec;
    expect(door3FinaleRunRevealYaw(lookBackEnd))
      .toBe(DOOR3_FINALE.runLookBackYawDeg);

    const holdEnd = lookBackEnd + DOOR3_FINALE.runLookBackHoldSec;
    expect(door3FinaleRunRevealYaw(holdEnd - 0.01))
      .toBeCloseTo(DOOR3_FINALE.runLookBackYawDeg, 4);
    expect(door3FinaleRunRevealYaw(holdEnd + DOOR3_FINALE.runReturnSec)).toBe(0);
  });

  it('is already physically moving before the floodgate ruptures behind the player', () => {
    expect(DOOR3_FINALE.runBreakAtSec).toBeGreaterThan(0);
    expect(door3FinaleRunBreakProgress(DOOR3_FINALE.runBreakAtSec)).toBe(0);
    expect(door3FinaleSecondRunOffset(DOOR3_FINALE.runBreakAtSec)).toBeLessThan(0);
    expect(door3FinaleRunBreakProgress(
      DOOR3_FINALE.runBreakAtSec + DOOR3_FINALE.breakSec,
    )).toBe(1);
  });

  it('reveals the black face only after rupture and while the shoulder-check is readable', () => {
    expect(DOOR3_FINALE.runFaceAtSec)
      .toBeGreaterThanOrEqual(DOOR3_FINALE.runBreakAtSec + DOOR3_FINALE.breakSec);
    expect(door3FinaleRunFaceProgress(DOOR3_FINALE.runFaceAtSec)).toBe(0);
    const faceFullAt = DOOR3_FINALE.runFaceAtSec + DOOR3_FINALE.faceRevealSec;
    expect(door3FinaleRunFaceProgress(faceFullAt)).toBe(1);
    expect(door3FinaleRunRevealYaw(faceFullAt)).toBeGreaterThan(120);
  });

  it('fails the old gate-side lamps during the moving reveal, without delaying the run', () => {
    expect(door3FinaleRunBlackoutClock(DOOR3_FINALE.runBlackoutAtSec - 0.01)).toBe(0);
    expect(door3FinaleRunBlackoutClock(DOOR3_FINALE.runBlackoutAtSec + 0.20))
      .toBeCloseTo(0.20, 8);

    expect(door3FinaleBlackoutLampCount(0)).toBe(0);
    expect(door3FinaleBlackoutLampCount(DOOR3_FINALE.blackoutLeadSec)).toBe(1);
    expect(door3FinaleBlackoutLampCount(
      DOOR3_FINALE.blackoutLeadSec + DOOR3_FINALE.blackoutStepSec * 2,
    )).toBe(3);

    const finalLampClock = DOOR3_FINALE.blackoutLeadSec +
      DOOR3_FINALE.blackoutStepSec * (DOOR3_FINALE.blackoutLampCount - 1);
    expect(door3FinaleBlackoutLampCount(finalLampClock))
      .toBe(DOOR3_FINALE.blackoutLampCount);
    expect(DOOR3_FINALE.runBlackoutAtSec + finalLampClock)
      .toBeLessThan(DOOR3_FINALE.secondRunSec);
    expect(door3FinaleBlackoutProgress(10)).toBe(1);
  });

  it('runs long enough for an endless corridor to register before the fall', () => {
    expect(DOOR3_FINALE.secondRunSec).toBeGreaterThanOrEqual(5);
    expect(DOOR3_FINALE.secondRunDistance).toBeGreaterThanOrEqual(16);
    expect(door3FinaleSecondRunProgress(0)).toBe(0);
    expect(door3FinaleSecondRunOffset(0)).toBe(0);
    const half = door3FinaleSecondRunOffset(DOOR3_FINALE.secondRunSec / 2);
    expect(half).toBeLessThan(0);
    expect(half).toBeGreaterThan(-DOOR3_FINALE.secondRunDistance);
    expect(door3FinaleSecondRunProgress(DOOR3_FINALE.secondRunSec)).toBe(1);
    expect(door3FinaleSecondRunOffset(DOOR3_FINALE.secondRunSec))
      .toBe(-DOOR3_FINALE.secondRunDistance);
  });

  it('reveals the contaminated slip hazard only near the end of the long sprint', () => {
    expect(DOOR3_FINALE.slipRevealProgress).toBeGreaterThanOrEqual(0.8);
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

  it('keeps the fallen view forward and never lets the threat close the gap before blackout', () => {
    expect(door3FinaleGroundLookYaw(0)).toBe(DOOR3_FINALE.fallTwistDeg);
    expect(door3FinaleGroundLookYaw(DOOR3_FINALE.blackoutAtSec)).toBeLessThan(20);
    expect(door3FinaleGroundChaseProgress(0)).toBe(0);
    expect(door3FinaleGroundChaseProgress(DOOR3_FINALE.blackoutAtSec)).toBeLessThan(0.01);
  });

  it('cuts to unconsciousness without the old near-eye jumpscare', () => {
    expect(DOOR3_FINALE.eyeFlashAtSec).toBeGreaterThan(DOOR3_FINALE.blackoutAtSec);
    expect(door3FinaleEyeFlash(0)).toBe(0);
    expect(door3FinaleEyeFlash(DOOR3_FINALE.blackoutAtSec - 0.01)).toBe(0);
    expect(door3FinaleEyeFlash(DOOR3_FINALE.blackoutAtSec)).toBe(0);
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
