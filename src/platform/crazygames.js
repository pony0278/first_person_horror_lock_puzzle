/* CG1 — CrazyGames SDK v3 adapter.
 *
 * CrazyGames globals stay behind this module. Game code should call this stable
 * boundary rather than window.CrazyGames.SDK directly.
 */

const VALID_AD_TYPES = new Set(['midgame', 'rewarded']);

function sdkOf(root) {
  return root?.CrazyGames?.SDK ?? null;
}

function normalizeError(error) {
  if (!error) return null;
  if (typeof error === 'string') return { code: 'error', message: error };
  return {
    code: String(error.code || 'error'),
    message: String(error.message || error),
  };
}

export function createCrazyGamesPlatform(root = globalThis) {
  let initPromise = null;
  const state = {
    initialized: false,
    available: false,
    enabled: false,
    environment: 'unavailable',
    error: null,
  };

  const snapshot = () => ({ ...state });

  const callableSdk = () => {
    const sdk = sdkOf(root);
    if (!state.initialized || !state.enabled || !sdk) return null;
    return sdk;
  };

  const callGame = method => {
    const sdk = callableSdk();
    const fn = sdk?.game?.[method];
    if (typeof fn !== 'function') return false;
    try {
      fn.call(sdk.game);
      return true;
    } catch (error) {
      state.error = normalizeError(error);
      return false;
    }
  };

  async function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const sdk = sdkOf(root);
      if (!sdk) return snapshot();

      state.available = true;
      try {
        if (typeof sdk.init !== 'function') throw new Error('CrazyGames SDK v3 init() is unavailable');
        await sdk.init();
        state.initialized = true;
        state.environment = String(sdk.environment || 'unknown');
        state.enabled = state.environment !== 'disabled';
        state.error = null;
      } catch (error) {
        state.initialized = false;
        state.enabled = false;
        state.environment = 'unavailable';
        state.error = normalizeError(error);
      }
      return snapshot();
    })();
    return initPromise;
  }

  function requestAd(type, callbacks = {}) {
    if (!VALID_AD_TYPES.has(type)) {
      return Promise.resolve({
        status: 'error',
        error: { code: 'invalidAdType', message: String(type) },
      });
    }

    const sdk = callableSdk();
    if (typeof sdk?.ad?.requestAd !== 'function')
      return Promise.resolve({ status: 'skipped', error: null });

    return new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      try {
        sdk.ad.requestAd(type, {
          adStarted: () => callbacks.adStarted?.(),
          adFinished: () => {
            callbacks.adFinished?.();
            finish({ status: 'finished', error: null });
          },
          adError: error => {
            const normalized = normalizeError(error);
            callbacks.adError?.(normalized);
            finish({ status: 'error', error: normalized });
          },
        });
      } catch (error) {
        const normalized = normalizeError(error);
        callbacks.adError?.(normalized);
        finish({ status: 'error', error: normalized });
      }
    });
  }

  return Object.freeze({
    init,
    snapshot,
    loadingStart: () => callGame('loadingStart'),
    loadingStop: () => callGame('loadingStop'),
    gameplayStart: () => callGame('gameplayStart'),
    gameplayStop: () => callGame('gameplayStop'),
    requestAd,
  });
}

export const crazyGamesPlatform = createCrazyGamesPlatform();
export const initCrazyGamesPlatform = () => crazyGamesPlatform.init();
export const crazyGamesPlatformSnapshot = () => crazyGamesPlatform.snapshot();
