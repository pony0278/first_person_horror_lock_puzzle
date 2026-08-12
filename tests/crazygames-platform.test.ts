import { describe, expect, it, vi } from 'vitest';
import { createCrazyGamesPlatform } from '../src/platform/crazygames.js';

describe('CG1 CrazyGames SDK v3 adapter', () => {
  it('is a safe no-op when the SDK is unavailable', async () => {
    const platform = createCrazyGamesPlatform({} as any);
    expect(await platform.init()).toEqual({
      initialized: false,
      available: false,
      enabled: false,
      environment: 'unavailable',
      error: null,
    });
    expect(platform.gameplayStart()).toBe(false);
    expect(platform.gameplayStop()).toBe(false);
    expect(platform.gameSettings()).toBeNull();
    await expect(platform.requestAd('midgame')).resolves.toEqual({
      status: 'skipped', error: null,
    });
  });

  it('initializes the v3 SDK once and forwards game lifecycle calls', async () => {
    const init = vi.fn(async () => undefined);
    const loadingStart = vi.fn();
    const loadingStop = vi.fn();
    const gameplayStart = vi.fn();
    const gameplayStop = vi.fn();
    const root = {
      CrazyGames: { SDK: {
        environment: 'local', init,
        game: { loadingStart, loadingStop, gameplayStart, gameplayStop },
      } },
    };
    const platform = createCrazyGamesPlatform(root as any);

    const first = await platform.init();
    const second = await platform.init();
    expect(first).toEqual(second);
    expect(init).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ initialized: true, available: true, enabled: true, environment: 'local' });

    expect(platform.loadingStart()).toBe(true);
    expect(platform.loadingStop()).toBe(true);
    expect(platform.gameplayStart()).toBe(true);
    expect(platform.gameplayStop()).toBe(true);
    expect(loadingStart).toHaveBeenCalledTimes(1);
    expect(loadingStop).toHaveBeenCalledTimes(1);
    expect(gameplayStart).toHaveBeenCalledTimes(1);
    expect(gameplayStop).toHaveBeenCalledTimes(1);
  });

  it('exposes game settings and wraps settings change listeners', async () => {
    let listener: unknown = null;
    const addSettingsChangeListener = vi.fn((fn: (settings: any) => void) => { listener = fn; });
    const removeSettingsChangeListener = vi.fn();
    const settings = { muteAudio: true, disableChat: false };
    const platform = createCrazyGamesPlatform({
      CrazyGames: { SDK: {
        environment: 'crazygames',
        init: vi.fn(async () => undefined),
        game: { settings, addSettingsChangeListener, removeSettingsChangeListener },
      } },
    } as any);
    await platform.init();

    expect(platform.gameSettings()).toEqual({ muteAudio: true, disableChat: false });
    const callback = vi.fn();
    const unsubscribe = platform.subscribeGameSettings(callback);
    expect(addSettingsChangeListener).toHaveBeenCalledTimes(1);

    (listener as (settings: any) => void)({ muteAudio: false, disableChat: true });
    expect(callback).toHaveBeenCalledWith({ muteAudio: false, disableChat: true });
    expect(unsubscribe()).toBe(true);
    expect(removeSettingsChangeListener).toHaveBeenCalledTimes(1);
    expect(unsubscribe()).toBe(false);
  });

  it('keeps calls disabled when the SDK reports a disabled environment', async () => {
    const gameplayStart = vi.fn();
    const platform = createCrazyGamesPlatform({
      CrazyGames: { SDK: {
        environment: 'disabled',
        init: vi.fn(async () => undefined),
        game: { gameplayStart },
      } },
    } as any);

    expect(await platform.init()).toMatchObject({
      initialized: true, available: true, enabled: false, environment: 'disabled',
    });
    expect(platform.gameplayStart()).toBe(false);
    expect(platform.gameSettings()).toBeNull();
    expect(gameplayStart).not.toHaveBeenCalled();
  });

  it('normalizes midgame ad completion behind one promise contract', async () => {
    const adStarted = vi.fn();
    const adFinished = vi.fn();
    const requestAd = vi.fn((_type, callbacks) => {
      callbacks.adStarted();
      callbacks.adFinished();
    });
    const platform = createCrazyGamesPlatform({
      CrazyGames: { SDK: {
        environment: 'crazygames',
        init: vi.fn(async () => undefined),
        ad: { requestAd },
      } },
    } as any);
    await platform.init();

    await expect(platform.requestAd('midgame', { adStarted, adFinished })).resolves.toEqual({
      status: 'finished', error: null,
    });
    expect(requestAd).toHaveBeenCalledTimes(1);
    expect(adStarted).toHaveBeenCalledTimes(1);
    expect(adFinished).toHaveBeenCalledTimes(1);
  });

  it('normalizes SDK ad errors, including Basic Launch style failures', async () => {
    const requestAd = vi.fn((_type, callbacks) => callbacks.adError({
      code: 'adsDisabledBasicLaunch',
      message: 'Ads are disabled during Basic Launch',
    }));
    const platform = createCrazyGamesPlatform({
      CrazyGames: { SDK: {
        environment: 'crazygames',
        init: vi.fn(async () => undefined),
        ad: { requestAd },
      } },
    } as any);
    await platform.init();

    await expect(platform.requestAd('midgame')).resolves.toEqual({
      status: 'error',
      error: {
        code: 'adsDisabledBasicLaunch',
        message: 'Ads are disabled during Basic Launch',
      },
    });
  });
});
