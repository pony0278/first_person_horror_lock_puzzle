import { describe, expect, it } from 'vitest';
import {
  BASIC_LAUNCH_AD_ERROR,
  buildCrazyGamesPreviewQaReport,
} from '../src/game/crazygames-preview-qa.js';

function healthySnapshots() {
  return {
    platform: {
      initialized: true,
      available: true,
      enabled: true,
      environment: 'crazygames',
      error: null,
    },
    gameplay: {
      sessionActive: true,
      reportedPlaying: true,
      shouldPlay: true,
      pauses: [],
    },
    audio: {
      initialized: true,
      platformMuted: false,
      adPlaying: false,
      audio: { muted: false, reasons: [] },
    },
    ad: {
      pending: false,
      adStarted: false,
      requestCount: 1,
      restartCount: 1,
      lastResult: {
        status: 'error',
        error: { code: BASIC_LAUNCH_AD_ERROR, message: 'disabled in Basic Launch' },
      },
    },
    game: { door: 1, over: false, won: false, lastAttempt: '追殺失敗' },
  };
}

describe('CG5 CrazyGames Preview QA report', () => {
  it('reports PASS after a Basic Launch ad rejection safely restarts gameplay', () => {
    const report = buildCrazyGamesPreviewQaReport({
      ...healthySnapshots(),
      expectCrazyGames: true,
    });

    expect(report.overall).toBe('PASS');
    expect(report.checks.platform.status).toBe('PASS');
    expect(report.checks.gameplay.status).toBe('PASS');
    expect(report.checks.audio.status).toBe('PASS');
    expect(report.checks.adFallback).toEqual({
      status: 'PASS',
      detail: 'adsDisabledBasicLaunch was handled and gameplay restarted',
    });
  });

  it('reports WAIT before the death/ad fallback path has been exercised', () => {
    const snapshots = healthySnapshots();
    snapshots.ad.requestCount = 0;
    snapshots.ad.restartCount = 0;
    snapshots.ad.lastResult = { status: 'idle', error: null } as any;

    const report = buildCrazyGamesPreviewQaReport({
      ...snapshots,
      expectCrazyGames: true,
    });
    expect(report.overall).toBe('WAIT');
    expect(report.checks.adFallback.status).toBe('WAIT');
  });

  it('reports FAIL when a rejected ad did not reach the safe restart path', () => {
    const snapshots = healthySnapshots();
    snapshots.ad.restartCount = 0;
    const report = buildCrazyGamesPreviewQaReport({
      ...snapshots,
      expectCrazyGames: true,
    });
    expect(report.overall).toBe('FAIL');
    expect(report.checks.adFallback.status).toBe('FAIL');
  });

  it('reports FAIL when CrazyGames mute state and mute reasons disagree', () => {
    const snapshots = healthySnapshots();
    snapshots.audio.platformMuted = true;
    snapshots.audio.audio = { muted: false, reasons: [] };
    const report = buildCrazyGamesPreviewQaReport({
      ...snapshots,
      expectCrazyGames: true,
    });
    expect(report.overall).toBe('FAIL');
    expect(report.checks.audio.status).toBe('FAIL');
  });

  it('accepts disabled/unavailable mode as a graceful fallback outside Preview', () => {
    const report = buildCrazyGamesPreviewQaReport({
      platform: {
        initialized: true,
        available: true,
        enabled: false,
        environment: 'disabled',
        error: null,
      },
      gameplay: {
        sessionActive: true,
        reportedPlaying: false,
        shouldPlay: true,
        pauses: [],
      },
      audio: {
        initialized: true,
        platformMuted: false,
        adPlaying: false,
        audio: { muted: false, reasons: [] },
      },
      ad: {
        pending: false,
        adStarted: false,
        requestCount: 1,
        restartCount: 1,
        lastResult: { status: 'skipped', error: null },
      },
      expectCrazyGames: false,
    });
    expect(report.overall).toBe('PASS');
    expect(report.checks.platform.status).toBe('PASS');
    expect(report.checks.gameplay.status).toBe('PASS');
    expect(report.checks.adFallback.status).toBe('PASS');
  });
});
