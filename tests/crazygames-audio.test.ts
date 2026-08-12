import { describe, expect, it, vi } from 'vitest';
import {
  CRAZYGAMES_AUDIO_REASONS,
  createCrazyGamesAudioLifecycle,
} from '../src/game/crazygames-audio.js';

function fakeAudioMute() {
  const reasons = new Set<string>();
  const setMuted = vi.fn(async (reason: string, on: boolean) => {
    if (on) reasons.add(reason);
    else reasons.delete(reason);
    return true;
  });
  return {
    setMuted,
    snapshot: () => ({ muted: reasons.size > 0, reasons: [...reasons].sort() }),
  };
}

describe('CG4 CrazyGames audio lifecycle', () => {
  it('applies initial SDK muteAudio and follows settings changes', async () => {
    const audioMute = fakeAudioMute();
    let listener: unknown = null;
    const unsubscribe = vi.fn(() => true);
    const platform = {
      gameSettings: vi.fn(() => ({ muteAudio: true, disableChat: false })),
      subscribeGameSettings: vi.fn((fn: (settings: any) => void) => {
        listener = fn;
        return unsubscribe;
      }),
    };
    const lifecycle = createCrazyGamesAudioLifecycle({
      ready: Promise.resolve({}),
      platform,
      audioMute,
    } as any);

    await lifecycle.start();
    expect(audioMute.setMuted).toHaveBeenCalledWith(
      CRAZYGAMES_AUDIO_REASONS.setting,
      true,
    );
    expect(lifecycle.snapshot().platformMuted).toBe(true);

    (listener as (settings: any) => void)({ muteAudio: false, disableChat: false });
    expect(audioMute.setMuted).toHaveBeenLastCalledWith(
      CRAZYGAMES_AUDIO_REASONS.setting,
      false,
    );
    expect(lifecycle.snapshot().platformMuted).toBe(false);
  });

  it('maps ad callbacks to an independent temporary mute reason', async () => {
    const audioMute = fakeAudioMute();
    const lifecycle = createCrazyGamesAudioLifecycle({
      ready: Promise.resolve({}),
      platform: {
        gameSettings: () => ({ muteAudio: true, disableChat: false }),
        subscribeGameSettings: () => () => true,
      },
      audioMute,
    } as any);

    await lifecycle.start();
    lifecycle.adStarted();
    expect(audioMute.snapshot().reasons).toEqual([
      CRAZYGAMES_AUDIO_REASONS.ad,
      CRAZYGAMES_AUDIO_REASONS.setting,
    ]);

    lifecycle.adEnded();
    expect(audioMute.snapshot().reasons).toEqual([
      CRAZYGAMES_AUDIO_REASONS.setting,
    ]);
    expect(lifecycle.snapshot()).toMatchObject({
      platformMuted: true,
      adPlaying: false,
    });
  });

  it('deduplicates repeated ad start/end callbacks', () => {
    const audioMute = fakeAudioMute();
    const lifecycle = createCrazyGamesAudioLifecycle({
      ready: Promise.resolve({}),
      platform: {},
      audioMute,
    } as any);

    expect(lifecycle.adStarted()).toBe(true);
    expect(lifecycle.adStarted()).toBe(false);
    expect(lifecycle.adEnded()).toBe(true);
    expect(lifecycle.adEnded()).toBe(false);
    expect(audioMute.setMuted).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes and releases both CrazyGames mute reasons on stop', async () => {
    const audioMute = fakeAudioMute();
    const unsubscribe = vi.fn(() => true);
    const lifecycle = createCrazyGamesAudioLifecycle({
      ready: Promise.resolve({}),
      platform: {
        gameSettings: () => ({ muteAudio: true, disableChat: false }),
        subscribeGameSettings: () => unsubscribe,
      },
      audioMute,
    } as any);

    await lifecycle.start();
    lifecycle.adStarted();
    lifecycle.stop();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(audioMute.snapshot().reasons).toEqual([]);
    expect(lifecycle.snapshot()).toMatchObject({
      initialized: false,
      platformMuted: false,
      adPlaying: false,
    });
  });
});
