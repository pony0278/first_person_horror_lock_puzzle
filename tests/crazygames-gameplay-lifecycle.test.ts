import { describe, expect, it, vi } from 'vitest';
import { createCrazyGamesGameplayLifecycle } from '../src/game/crazygames-lifecycle.js';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function platformMock() {
  return {
    gameplayStart: vi.fn(() => true),
    gameplayStop: vi.fn(() => true),
  };
}

describe('CG2 CrazyGames gameplay lifecycle', () => {
  it('waits for SDK readiness before emitting the first gameplayStart', async () => {
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    const platform = platformMock();
    const lifecycle = createCrazyGamesGameplayLifecycle({ ready, platform } as any);

    lifecycle.beginSession();
    expect(platform.gameplayStart).not.toHaveBeenCalled();
    expect(lifecycle.snapshot()).toMatchObject({ sessionActive: true, reportedPlaying: false });

    release();
    await flush();
    expect(platform.gameplayStart).toHaveBeenCalledTimes(1);
    expect(lifecycle.snapshot()).toMatchObject({ sessionActive: true, reportedPlaying: true });
  });

  it('deduplicates repeated begin/end requests', async () => {
    const platform = platformMock();
    const lifecycle = createCrazyGamesGameplayLifecycle({
      ready: Promise.resolve(), platform,
    } as any);

    lifecycle.beginSession();
    lifecycle.beginSession();
    await flush();
    expect(platform.gameplayStart).toHaveBeenCalledTimes(1);

    lifecycle.endSession();
    lifecycle.endSession();
    await flush();
    expect(platform.gameplayStop).toHaveBeenCalledTimes(1);
  });

  it('stops for an owned interruption and restarts when it resumes', async () => {
    const platform = platformMock();
    const lifecycle = createCrazyGamesGameplayLifecycle({
      ready: Promise.resolve(), platform,
    } as any);

    lifecycle.beginSession();
    await flush();
    lifecycle.pause('contextlost');
    await flush();
    expect(platform.gameplayStop).toHaveBeenCalledTimes(1);
    expect(lifecycle.snapshot()).toMatchObject({
      sessionActive: true, reportedPlaying: false, shouldPlay: false,
      pauses: ['contextlost'],
    });

    lifecycle.resume('contextlost');
    await flush();
    expect(platform.gameplayStart).toHaveBeenCalledTimes(2);
    expect(lifecycle.snapshot()).toMatchObject({
      sessionActive: true, reportedPlaying: true, shouldPlay: true, pauses: [],
    });
  });

  it('does not emit stale start/stop events if state changes before SDK readiness', async () => {
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    const platform = platformMock();
    const lifecycle = createCrazyGamesGameplayLifecycle({ ready, platform } as any);

    lifecycle.beginSession();
    lifecycle.endSession();
    release();
    await flush();

    expect(platform.gameplayStart).not.toHaveBeenCalled();
    expect(platform.gameplayStop).not.toHaveBeenCalled();
    expect(lifecycle.snapshot()).toMatchObject({
      sessionActive: false, reportedPlaying: false, shouldPlay: false,
    });
  });

  it('keeps multiple pause reasons stopped until the final owned pause clears', async () => {
    const platform = platformMock();
    const lifecycle = createCrazyGamesGameplayLifecycle({
      ready: Promise.resolve(), platform,
    } as any);

    lifecycle.beginSession();
    await flush();
    lifecycle.pause('contextlost');
    lifecycle.pause('manual');
    await flush();
    expect(platform.gameplayStop).toHaveBeenCalledTimes(1);

    lifecycle.resume('contextlost');
    await flush();
    expect(platform.gameplayStart).toHaveBeenCalledTimes(1);

    lifecycle.resume('manual');
    await flush();
    expect(platform.gameplayStart).toHaveBeenCalledTimes(2);
  });
});
