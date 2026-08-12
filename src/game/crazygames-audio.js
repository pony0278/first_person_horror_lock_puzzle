/* CG4 — CrazyGames audio lifecycle.
 *
 * One coordinator maps platform-owned audio requirements onto named mute reasons:
 * - `crazygames-setting`: SDK game.settings.muteAudio (persistent)
 * - `crazygames-ad`: active video advertisement (temporary)
 *
 * The injected audioMute controller decides when Web Audio may actually resume.
 */
import { crazyGamesPlatform } from '../platform/crazygames.js';
import { crazyGamesReady } from '../platform/crazygames-bootstrap.js';

export const CRAZYGAMES_AUDIO_REASONS = Object.freeze({
  setting: 'crazygames-setting',
  ad: 'crazygames-ad',
});

const NO_AUDIO_MUTE = Object.freeze({
  setMuted: () => Promise.resolve(false),
  snapshot: () => ({ muted: false, reasons: [] }),
});

export function createCrazyGamesAudioLifecycle({
  ready = crazyGamesReady,
  platform = crazyGamesPlatform,
  audioMute = NO_AUDIO_MUTE,
} = {}) {
  let startPromise = null;
  let unsubscribe = null;
  let initialized = false;
  let platformMuted = false;
  let adPlaying = false;
  let generation = 0;

  function applySettings(settings) {
    platformMuted = Boolean(settings?.muteAudio);
    audioMute.setMuted(CRAZYGAMES_AUDIO_REASONS.setting, platformMuted);
  }

  async function start() {
    if (startPromise) return startPromise;
    const token = ++generation;
    startPromise = (async () => {
      await ready;
      if (token !== generation) return snapshot();

      applySettings(platform.gameSettings?.());
      unsubscribe = platform.subscribeGameSettings?.(applySettings) ?? null;
      initialized = true;
      return snapshot();
    })();
    return startPromise;
  }

  function adStarted() {
    if (adPlaying) return false;
    adPlaying = true;
    audioMute.setMuted(CRAZYGAMES_AUDIO_REASONS.ad, true);
    return true;
  }

  function adEnded() {
    if (!adPlaying) return false;
    adPlaying = false;
    audioMute.setMuted(CRAZYGAMES_AUDIO_REASONS.ad, false);
    return true;
  }

  function stop() {
    generation++;
    unsubscribe?.();
    unsubscribe = null;
    initialized = false;
    platformMuted = false;
    adPlaying = false;
    audioMute.setMuted(CRAZYGAMES_AUDIO_REASONS.setting, false);
    audioMute.setMuted(CRAZYGAMES_AUDIO_REASONS.ad, false);
    startPromise = null;
  }

  function snapshot() {
    return {
      initialized,
      platformMuted,
      adPlaying,
      audio: audioMute.snapshot?.() ?? null,
    };
  }

  const adGate = Object.freeze({
    suspend: adStarted,
    resume: adEnded,
    snapshot,
  });

  return Object.freeze({ start, stop, adStarted, adEnded, adGate, snapshot });
}
