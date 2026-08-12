/* CG2 — CrazyGames gameplay lifecycle coordinator.
 *
 * Game code owns semantic gameplay state; the platform adapter owns SDK calls.
 * This coordinator bridges the two without leaking window.CrazyGames globals
 * into round / halt code and without emitting duplicate start/stop events.
 */
import { crazyGamesReady } from '../platform/crazygames-bootstrap.js';
import { crazyGamesPlatform } from '../platform/crazygames.js';

export function createCrazyGamesGameplayLifecycle({
  ready = crazyGamesReady,
  platform = crazyGamesPlatform,
} = {}) {
  let sessionActive = false;
  let reportedPlaying = false;
  let reconcileSerial = 0;
  const pauses = new Set();

  const shouldPlay = () => sessionActive && pauses.size === 0;

  async function reconcile() {
    const serial = ++reconcileSerial;
    try { await ready; } catch { /* adapter state already captures init failure */ }
    if (serial !== reconcileSerial) return false;

    const next = shouldPlay();
    if (next === reportedPlaying) return false;

    const emitted = next ? platform.gameplayStart() : platform.gameplayStop();
    if (emitted) reportedPlaying = next;
    return emitted;
  }

  function beginSession() {
    sessionActive = true;
    void reconcile();
  }

  function endSession() {
    sessionActive = false;
    void reconcile();
  }

  function pause(reason) {
    if (!reason) return;
    pauses.add(String(reason));
    void reconcile();
  }

  function resume(reason) {
    if (!reason) return;
    pauses.delete(String(reason));
    void reconcile();
  }

  function snapshot() {
    return {
      sessionActive,
      reportedPlaying,
      shouldPlay: shouldPlay(),
      pauses: [...pauses].sort(),
    };
  }

  return Object.freeze({ beginSession, endSession, pause, resume, snapshot });
}

export const crazyGamesGameplay = createCrazyGamesGameplayLifecycle();
export const crazyGamesGameplaySnapshot = () => crazyGamesGameplay.snapshot();

globalThis.__crazyGamesGameplay = () => crazyGamesGameplaySnapshot();
