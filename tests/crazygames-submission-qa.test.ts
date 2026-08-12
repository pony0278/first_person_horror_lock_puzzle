import { describe, expect, it } from 'vitest';
import {
  CRAZYGAMES_DESKTOP_VIEWPORTS,
  assessCrazyGamesSubmissionFrame,
  hasHanText,
  nearestCrazyGamesViewport,
} from '../src/game/crazygames-submission-qa.js';

const rect = (left: number, top: number, width: number, height: number) => ({
  left, top, width, height, right: left + width, bottom: top + height,
});

describe('CG6 CrazyGames submission QA', () => {
  it('locks the high-risk desktop iframe sizes into the QA contract', () => {
    expect(CRAZYGAMES_DESKTOP_VIEWPORTS).toEqual(expect.arrayContaining([
      expect.objectContaining({ width: 821, height: 462 }),
      expect.objectContaining({ width: 907, height: 510 }),
      expect.objectContaining({ width: 1216, height: 684 }),
      expect.objectContaining({ width: 1280, height: 720 }),
    ]));
    for (const target of CRAZYGAMES_DESKTOP_VIEWPORTS)
      expect(target.width / target.height).toBeCloseTo(16 / 9, 2);
  });

  it('passes a clean 821x462 DPR1 desktop frame', () => {
    const report = assessCrazyGamesSubmissionFrame({
      width: 821,
      height: 462,
      dpr: 1,
      lang: 'en',
      title: 'First Person Horror Lock Puzzle',
      scrollWidth: 821,
      scrollHeight: 462,
      playerTexts: ['HOLD VIEW = LOOK BACK · RELEASE = RETURN TO LOCK', 'VENT ALL'],
      cueRect: rect(0, 280, 821, 18),
      dumpRect: rect(12, 398, 72, 44),
      dumpVisible: true,
      platformQa: { overall: 'PASS' },
    } as any);

    expect(report.overall).toBe('PASS');
    expect(report.checks.viewport.status).toBe('PASS');
    expect(report.checks.touchTarget.status).toBe('PASS');
  });

  it('fails visible Han text, overflow, or clipped controls', () => {
    const report = assessCrazyGamesSubmissionFrame({
      width: 907,
      height: 510,
      dpr: 1,
      lang: 'en',
      title: 'First Person Horror Lock Puzzle',
      scrollWidth: 930,
      scrollHeight: 510,
      playerTexts: ['防洪門已開　·　向前衝'],
      cueRect: rect(0, 500, 907, 20),
      dumpRect: rect(880, 450, 60, 44),
      dumpVisible: true,
      platformQa: { overall: 'PASS' },
    } as any);

    expect(report.overall).toBe('FAIL');
    expect(report.checks.english.status).toBe('FAIL');
    expect(report.checks.overflow.status).toBe('FAIL');
    expect(report.checks.clipping.status).toBe('FAIL');
  });

  it('returns WAIT rather than FAIL when QA is run at a non-target viewport or DPR', () => {
    const report = assessCrazyGamesSubmissionFrame({
      width: 1000,
      height: 600,
      dpr: 2,
      lang: 'en-US',
      title: 'First Person Horror Lock Puzzle',
      scrollWidth: 1000,
      scrollHeight: 600,
      playerTexts: ['VENT ALL'],
      dumpVisible: false,
      platformQa: { overall: 'PASS' },
    } as any);
    expect(report.overall).toBe('WAIT');
    expect(report.checks.viewport.status).toBe('WAIT');
    expect(report.checks.dpr.status).toBe('WAIT');
  });

  it('finds nearest target and detects Han characters', () => {
    expect(nearestCrazyGamesViewport(905, 509)).toMatchObject({ width: 907, height: 510 });
    expect(hasHanText('TO BE CONTINUED')).toBe(false);
    expect(hasHanText('未完待續')).toBe(true);
  });
});
