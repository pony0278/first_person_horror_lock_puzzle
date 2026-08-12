import { describe, expect, it, vi } from 'vitest';
import { createCrazyGamesMidgameRestartFlow } from '../src/game/crazygames-midgame-ad.js';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function fakeAudioGate() {
  let suspended = false;
  const suspend = vi.fn(() => {
    if (suspended) return false;
    suspended = true;
    return true;
  });
  const resume = vi.fn(() => {
    if (!suspended) return false;
    suspended = false;
    return true;
  });
  return {
    suspend,
    resume,
    snapshot: () => ({ suspendedByAd: suspended }),
  };
}

describe('CG3 CrazyGames death / restart midgame ad', () => {
  it('mutes only after adStarted, resumes, then restarts after a finished ad', async () => {
    const audioGate = fakeAudioGate();
    const requestAd = vi.fn(async (type: string, callbacks: any) => {
      expect(type).toBe('midgame');
      expect(audioGate.snapshot().suspendedByAd).toBe(false);
      callbacks.adStarted();
      expect(audioGate.snapshot().suspendedByAd).toBe(true);
      callbacks.adFinished();
      return { status: 'finished', error: null };
    });
    const restart = vi.fn();
    const flow = createCrazyGamesMidgameRestartFlow({
      ready: Promise.resolve({}),
      platform: { requestAd },
      audioGate,
    } as any);

    await expect(flow.requestAndRestart(restart)).resolves.toEqual({
      status: 'finished', error: null,
    });
    expect(requestAd).toHaveBeenCalledTimes(1);
    expect(audioGate.suspend).toHaveBeenCalledTimes(1);
    expect(audioGate.snapshot().suspendedByAd).toBe(false);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(flow.snapshot()).toMatchObject({ pending: false, adStarted: false });
    expect(flow.cancelPending()).toBe(false);
  });

  it('restarts cleanly when Basic Launch or another SDK ad error occurs', async () => {
    const audioGate = fakeAudioGate();
    const result = {
      status: 'error',
      error: {
        code: 'adsDisabledBasicLaunch',
        message: 'Ads are disabled during Basic Launch',
      },
    };
    const requestAd = vi.fn(async (_type: string, callbacks: any) => {
      callbacks.adError(result.error);
      return result;
    });
    const restart = vi.fn();
    const flow = createCrazyGamesMidgameRestartFlow({
      ready: Promise.resolve({}),
      platform: { requestAd },
      audioGate,
    } as any);

    await expect(flow.requestAndRestart(restart)).resolves.toEqual(result);
    expect(audioGate.suspend).not.toHaveBeenCalled();
    expect(audioGate.snapshot().suspendedByAd).toBe(false);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(flow.snapshot().lastResult).toEqual(result);
  });

  it('treats disabled/unavailable SDK skips as an immediate safe restart', async () => {
    const audioGate = fakeAudioGate();
    const requestAd = vi.fn(async () => ({ status: 'skipped', error: null }));
    const restart = vi.fn();
    const flow = createCrazyGamesMidgameRestartFlow({
      ready: Promise.resolve({}),
      platform: { requestAd },
      audioGate,
    } as any);

    await expect(flow.requestAndRestart(restart)).resolves.toEqual({
      status: 'skipped', error: null,
    });
    expect(restart).toHaveBeenCalledTimes(1);
    expect(audioGate.suspend).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent death restart requests into one ad request', async () => {
    const ad = deferred<{ status: string; error: null }>();
    const requestAd = vi.fn(() => ad.promise);
    const restart = vi.fn();
    const flow = createCrazyGamesMidgameRestartFlow({
      ready: Promise.resolve({}),
      platform: { requestAd },
      audioGate: fakeAudioGate(),
    } as any);

    const first = flow.requestAndRestart(restart);
    const second = flow.requestAndRestart(restart);
    expect(second).toBe(first);
    await Promise.resolve();
    expect(requestAd).toHaveBeenCalledTimes(1);

    ad.resolve({ status: 'finished', error: null });
    await first;
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('cancels a stale pre-init request without requesting an ad or restarting', async () => {
    const sdkReady = deferred<{}>();
    const requestAd = vi.fn(async () => ({ status: 'finished', error: null }));
    const restart = vi.fn();
    const flow = createCrazyGamesMidgameRestartFlow({
      ready: sdkReady.promise,
      platform: { requestAd },
      audioGate: fakeAudioGate(),
    } as any);

    const pending = flow.requestAndRestart(restart);
    expect(flow.snapshot().pending).toBe(true);
    expect(flow.cancelPending()).toBe(true);
    sdkReady.resolve({});

    await expect(pending).resolves.toEqual({ status: 'cancelled', error: null });
    expect(requestAd).not.toHaveBeenCalled();
    expect(restart).not.toHaveBeenCalled();
    expect(flow.snapshot().pending).toBe(false);
  });
});
