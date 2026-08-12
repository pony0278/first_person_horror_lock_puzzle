import { describe, expect, it, vi } from 'vitest';
import { createCrazyGamesPlatform } from '../src/platform/crazygames.js';
import { createCrazyGamesGameplayLifecycle } from '../src/game/crazygames-lifecycle.js';
import {
  CRAZYGAMES_AUDIO_REASONS,
  createCrazyGamesAudioLifecycle,
} from '../src/game/crazygames-audio.js';
import { createCrazyGamesMidgameRestartFlow } from '../src/game/crazygames-midgame-ad.js';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function fakeAudioMute() {
  const reasons = new Set<string>();
  return {
    setMuted: vi.fn(async (reason: string, on: boolean) => {
      if (on) reasons.add(reason);
      else reasons.delete(reason);
      return true;
    }),
    snapshot: () => ({ muted: reasons.size > 0, reasons: [...reasons].sort() }),
  };
}

describe('CG5 Basic Launch graceful fallback', () => {
  it('survives adsDisabledBasicLaunch, restarts gameplay, and preserves platform mute', async () => {
    const gameplayStart = vi.fn();
    const gameplayStop = vi.fn();
    let settingsListener: ((settings: any) => void) | null = null;
    const adRequest = vi.fn((_type: string, callbacks: any) => {
      callbacks.adError({
        code: 'adsDisabledBasicLaunch',
        message: 'Ads are disabled during Basic Launch',
      });
    });
    const sdk = {
      environment: 'crazygames',
      init: vi.fn(async () => undefined),
      game: {
        settings: { muteAudio: true, disableChat: false },
        gameplayStart,
        gameplayStop,
        addSettingsChangeListener: vi.fn((fn: (settings: any) => void) => { settingsListener = fn; }),
        removeSettingsChangeListener: vi.fn(),
      },
      ad: { requestAd: adRequest },
    };
    const platform = createCrazyGamesPlatform({ CrazyGames: { SDK: sdk } } as any);
    const ready = platform.init();
    const audioMute = fakeAudioMute();
    const audio = createCrazyGamesAudioLifecycle({ ready, platform, audioMute } as any);
    const gameplay = createCrazyGamesGameplayLifecycle({ ready, platform } as any);
    const ad = createCrazyGamesMidgameRestartFlow({
      ready,
      platform,
      audioGate: audio.adGate,
    } as any);

    await audio.start();
    expect(audioMute.snapshot().reasons).toContain(CRAZYGAMES_AUDIO_REASONS.setting);

    gameplay.beginSession();
    await flush();
    expect(gameplayStart).toHaveBeenCalledTimes(1);
    expect(gameplay.snapshot()).toMatchObject({
      sessionActive: true,
      reportedPlaying: true,
      shouldPlay: true,
    });

    gameplay.endSession();
    await flush();
    expect(gameplayStop).toHaveBeenCalledTimes(1);

    const restart = vi.fn(() => gameplay.beginSession());
    await expect(ad.requestAndRestart(restart)).resolves.toEqual({
      status: 'error',
      error: {
        code: 'adsDisabledBasicLaunch',
        message: 'Ads are disabled during Basic Launch',
      },
    });
    await flush();

    expect(adRequest).toHaveBeenCalledTimes(1);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(gameplayStart).toHaveBeenCalledTimes(2);
    expect(ad.snapshot()).toMatchObject({
      pending: false,
      adStarted: false,
      requestCount: 1,
      restartCount: 1,
    });
    expect(audio.snapshot()).toMatchObject({ platformMuted: true, adPlaying: false });
    expect(audioMute.snapshot().reasons).toEqual([CRAZYGAMES_AUDIO_REASONS.setting]);

    (settingsListener as ((settings: any) => void) | null)?.({
      muteAudio: false,
      disableChat: false,
    });
    expect(audioMute.snapshot().reasons).toEqual([]);
  });

  it('treats a disabled SDK environment as a non-blocking ad/gameplay no-op', async () => {
    const gameplayStart = vi.fn();
    const adRequest = vi.fn(() => { throw new Error('disabled SDK ad call must not happen'); });
    const platform = createCrazyGamesPlatform({
      CrazyGames: { SDK: {
        environment: 'disabled',
        init: vi.fn(async () => undefined),
        game: { gameplayStart },
        ad: { requestAd: adRequest },
      } },
    } as any);
    const ready = platform.init();
    const gameplay = createCrazyGamesGameplayLifecycle({ ready, platform } as any);
    const ad = createCrazyGamesMidgameRestartFlow({ ready, platform } as any);

    await ready;
    gameplay.beginSession();
    await flush();
    expect(gameplayStart).not.toHaveBeenCalled();
    expect(gameplay.snapshot()).toMatchObject({ sessionActive: true, reportedPlaying: false });

    const restart = vi.fn();
    await expect(ad.requestAndRestart(restart)).resolves.toEqual({ status: 'skipped', error: null });
    expect(adRequest).not.toHaveBeenCalled();
    expect(restart).toHaveBeenCalledTimes(1);
    expect(ad.snapshot()).toMatchObject({ requestCount: 1, restartCount: 1 });
  });

  it('survives a completely unavailable SDK with the same safe restart contract', async () => {
    const platform = createCrazyGamesPlatform({} as any);
    const ready = platform.init();
    const gameplay = createCrazyGamesGameplayLifecycle({ ready, platform } as any);
    const ad = createCrazyGamesMidgameRestartFlow({ ready, platform } as any);

    expect(await ready).toMatchObject({
      available: false,
      enabled: false,
      environment: 'unavailable',
    });
    gameplay.beginSession();
    await flush();

    const restart = vi.fn();
    await expect(ad.requestAndRestart(restart)).resolves.toEqual({ status: 'skipped', error: null });
    expect(restart).toHaveBeenCalledTimes(1);
    expect(ad.snapshot()).toMatchObject({
      pending: false,
      requestCount: 1,
      restartCount: 1,
    });
  });
});
