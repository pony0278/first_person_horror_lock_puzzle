import { describe, expect, it } from 'vitest';
import {
  DOOR3_FINALE,
  door3FinaleSecondRunProgress,
  door3FinaleSlipProgress,
} from '../src/logic/door3-finale';
import {
  DOOR3_LEVEL0_FINALE,
  door3Level0CompleteReady,
  door3Level0HumReady,
  door3Level0NoclipReady,
  door3Level0OutroReady,
  door3Level0RevealReady,
} from '../src/logic/door3-level0-finale';

describe('Door 3 F2.5R.6 optimized Level 0 noclip finale', () => {
  it('waits until the running shoulder-check has fully returned forward', () => {
    const lookBackEnd = DOOR3_FINALE.runLookBackStartSec + DOOR3_FINALE.runLookBackSec;
    const returnEnd = lookBackEnd + DOOR3_FINALE.runLookBackHoldSec + DOOR3_FINALE.runReturnSec;
    expect(DOOR3_LEVEL0_FINALE.noclipAtRunSec).toBeGreaterThan(returnEnd);
    expect(door3Level0NoclipReady(DOOR3_LEVEL0_FINALE.noclipAtRunSec - 0.01)).toBe(false);
    expect(door3Level0NoclipReady(DOOR3_LEVEL0_FINALE.noclipAtRunSec)).toBe(true);
  });

  it('cuts away before the old red-puddle / fall ending can begin', () => {
    const runProgress = door3FinaleSecondRunProgress(DOOR3_LEVEL0_FINALE.noclipAtRunSec);
    expect(runProgress).toBeLessThan(DOOR3_FINALE.slipRevealProgress);
    expect(door3FinaleSlipProgress(runProgress)).toBe(0);
    expect(DOOR3_LEVEL0_FINALE.noclipAtRunSec).toBeLessThan(DOOR3_FINALE.secondRunSec);
  });

  it('starts fluorescent hum before the black cover reveals Level 0', () => {
    expect(DOOR3_LEVEL0_FINALE.humLeadSec).toBeLessThan(DOOR3_LEVEL0_FINALE.blackHoldSec);
    expect(door3Level0HumReady(DOOR3_LEVEL0_FINALE.humLeadSec - 0.01)).toBe(false);
    expect(door3Level0HumReady(DOOR3_LEVEL0_FINALE.humLeadSec)).toBe(true);
    expect(door3Level0RevealReady(DOOR3_LEVEL0_FINALE.blackHoldSec - 0.01)).toBe(false);
    expect(door3Level0RevealReady(DOOR3_LEVEL0_FINALE.blackHoldSec)).toBe(true);
  });

  it('keeps the Level 0 cliffhanger short and non-playable', () => {
    expect(DOOR3_LEVEL0_FINALE.level0HoldSec).toBe(2.2);
    expect(door3Level0OutroReady(2.19)).toBe(false);
    expect(door3Level0OutroReady(2.20)).toBe(true);
  });

  it('holds black after the Level 0 image before completing', () => {
    const completeAt = DOOR3_LEVEL0_FINALE.outroFadeSec + DOOR3_LEVEL0_FINALE.clearDelaySec;
    expect(door3Level0CompleteReady(completeAt - 0.01)).toBe(false);
    expect(door3Level0CompleteReady(completeAt)).toBe(true);
  });

  it('locks the lightweight render budget instead of the uploaded demo light grid', () => {
    expect(DOOR3_LEVEL0_FINALE.textureSize).toBe(256);
    expect(DOOR3_LEVEL0_FINALE.wallInstances).toBe(16);
    expect(DOOR3_LEVEL0_FINALE.fixtureInstances).toBe(8);
    expect(DOOR3_LEVEL0_FINALE.realLights).toBe(3);
    expect(DOOR3_LEVEL0_FINALE.realLights).toBeLessThanOrEqual(3);
  });
});
