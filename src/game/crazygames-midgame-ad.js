/* CG3 — Death / Restart Midgame Ad.
 *
 * Midgame ads are requested only after a real death result. The round is already
 * frozen and covered before this flow begins, so an ad request can never advance
 * gameplay. Basic Launch / unfilled / adblock / cooldown errors all converge on
 * the same restart path.
 *
 * This coordinator is intentionally independent from game/audio.js. Runtime code
 * injects an AudioContext gate; unit tests can inject a deterministic fake.
 */
import { crazyGamesPlatform } from '../platform/crazygames.js';
import { crazyGamesReady } from '../platform/crazygames-bootstrap.js';

export function createAudioAdGate(context) {
  let suspendedByAd = false;

  function suspend() {
    const audio = context?.();
    suspendedByAd = Boolean(
      audio && audio.state === 'running' && typeof audio.suspend === 'function',
    );
    if (!suspendedByAd) return false;
    audio.suspend().catch(() => { suspendedByAd = false; });
    return true;
  }

  function resume() {
    if (!suspendedByAd) return false;
    suspendedByAd = false;
    const audio = context?.();
    if (!audio || audio.state !== 'suspended' || globalThis.document?.hidden ||
        typeof audio.resume !== 'function') return false;
    audio.resume().catch(() => {});
    return true;
  }

  return { suspend, resume, snapshot: () => ({ suspendedByAd }) };
}

const NO_AUDIO_GATE = Object.freeze({
  suspend: () => false,
  resume: () => false,
  snapshot: () => ({ suspendedByAd: false }),
});

export function createCrazyGamesMidgameRestartFlow({
  ready = crazyGamesReady,
  platform = crazyGamesPlatform,
  audioGate = NO_AUDIO_GATE,
} = {}) {
  let generation = 0;
  let pendingPromise = null;
  let pending = false;
  let adStarted = false;
  let lastResult = { status: 'idle', error: null };

  const snapshot = () => ({
    pending,
    adStarted,
    lastResult,
    audio: audioGate.snapshot?.() ?? null,
  });

  function cancelPending() {
    if (!pending) return false;
    generation++;
    pending = false;
    adStarted = false;
    // Do not resume audio here. If an ad has already started, only its actual
    // finished/error callback may restore audio; otherwise game audio could play
    // over the advertisement.
    return true;
  }

  function requestAndRestart(restart) {
    if (pendingPromise) return pendingPromise;

    const token = ++generation;
    pending = true;
    adStarted = false;

    pendingPromise = (async () => {
      try {
        await ready;
        if (token !== generation) return { status: 'cancelled', error: null };

        const result = await platform.requestAd('midgame', {
          adStarted: () => {
            adStarted = true;
            audioGate.suspend();
          },
          adFinished: () => audioGate.resume(),
          adError: () => audioGate.resume(),
        });

        // The adapter normally invokes one completion callback. Keep this
        // idempotent fallback so future SDK behavior cannot leave audio suspended.
        audioGate.resume();

        if (token !== generation) return { status: 'cancelled', error: null };
        lastResult = result;
        pending = false;
        adStarted = false;
        restart?.();
        return result;
      } catch (error) {
        audioGate.resume();
        if (token !== generation) return { status: 'cancelled', error: null };
        const normalized = {
          status: 'error',
          error: {
            code: String(error?.code || 'other'),
            message: String(error?.message || error || 'Unknown ad error'),
          },
        };
        lastResult = normalized;
        pending = false;
        adStarted = false;
        restart?.();
        return normalized;
      } finally {
        // A second request cannot start while pendingPromise is non-null, so the
        // current task always owns this slot even if it was cancelled pre-init.
        pendingPromise = null;
      }
    })();

    return pendingPromise;
  }

  return Object.freeze({ requestAndRestart, cancelPending, snapshot });
}
