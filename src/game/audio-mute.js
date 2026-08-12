/* CG4 — coordinated Web Audio mute lifecycle.
 *
 * Multiple independent owners may require silence at the same time (for example
 * a CrazyGames video ad and SDK game.settings.muteAudio). A Set of named reasons
 * prevents one owner from resuming audio while another still requires silence.
 *
 * The controller only auto-resumes a context that it previously suspended. If
 * the browser / OS suspended Web Audio first, removing a CrazyGames mute reason
 * must not wake it behind the browser's back.
 */

export function createAudioMuteController({
  context = () => null,
  hidden = () => false,
} = {}) {
  const reasons = new Set();
  let suspendedByController = false;
  let resumeDeferred = false;
  let transition = Promise.resolve(false);
  let lastError = null;

  const snapshot = () => ({
    muted: reasons.size > 0,
    reasons: [...reasons].sort(),
    suspendedByController,
    resumeDeferred,
    contextState: context?.()?.state ?? 'not-created',
    error: lastError,
  });

  const normalizeError = error => ({
    code: String(error?.name || error?.code || 'audioError'),
    message: String(error?.message || error || 'Unknown audio error'),
  });

  async function reconcile() {
    const audio = context?.();
    if (!audio) return false;

    if (reasons.size > 0) {
      resumeDeferred = false;
      if (audio.state !== 'running' || typeof audio.suspend !== 'function') return false;
      try {
        await audio.suspend();
        suspendedByController = true;
        lastError = null;
        return true;
      } catch (error) {
        suspendedByController = false;
        lastError = normalizeError(error);
        return false;
      }
    }

    if (!suspendedByController) return false;
    if (hidden?.()) {
      resumeDeferred = true;
      return false;
    }

    if (audio.state === 'running') {
      suspendedByController = false;
      resumeDeferred = false;
      lastError = null;
      return false;
    }
    if (audio.state !== 'suspended' || typeof audio.resume !== 'function') return false;

    try {
      await audio.resume();
      suspendedByController = false;
      resumeDeferred = false;
      lastError = null;
      return true;
    } catch (error) {
      resumeDeferred = true;
      lastError = normalizeError(error);
      return false;
    }
  }

  function queueReconcile() {
    transition = transition.then(reconcile, reconcile);
    return transition;
  }

  function setMuted(reason, on) {
    const key = String(reason || '').trim();
    if (!key) return Promise.resolve(false);
    if (on) reasons.add(key);
    else reasons.delete(key);
    return queueReconcile();
  }

  function foreground() {
    if (reasons.size > 0) return queueReconcile();
    if (!resumeDeferred && !suspendedByController) return Promise.resolve(false);
    return queueReconcile();
  }

  function canResume() {
    return reasons.size === 0;
  }

  function noteExternalRunning() {
    const audio = context?.();
    if (audio?.state !== 'running') return false;
    suspendedByController = false;
    resumeDeferred = false;
    return true;
  }

  return Object.freeze({
    setMuted,
    foreground,
    canResume,
    noteExternalRunning,
    snapshot,
  });
}
