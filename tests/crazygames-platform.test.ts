import { describe, expect, it, vi } from 'vitest';
import { createCrazyGamesPlatform } from '../src/platform/crazygames.js';

describe('CG1 CrazyGames SDK v3 adapter', () => {
  it('is a safe no-op when the SDK is unavailable', async () => {
    const platform = createCrazyGamesPlatform({});
    expect(await platform.init()).toEqual({
      initialized: false,
      available: false,
      enabled: false,
      environment: 'unavailable',
      error: null,
    });
    expect(platform.gameplayStart()).toBe(false);
    expect(platform.gameplayStop()).toBe(false);
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
    const platform = createCrazyGamesPlatform(root);

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

  it('keeps calls disabled when the SDK reports a disabled environment', async () => {
    const gameplayStart = vi.fn();
    const platform = createCrazyGamesPlatform({
      CrazyGames: { SDK: {
        environment: 'disabled',
        init: vi.fn(async () => undefined),
        game: { gameplayStart },
      } },
    });

    expect(await platform.init()).toMatchObject({
      initialized: true, available: true, enabled: false, environment: 'disabled',
    });
    expect(platform.gameplayStart()).toBe(false);
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
    });
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
    });
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
