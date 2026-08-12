/* CG5 — CrazyGames Basic Launch / Preview QA reporter.
 *
 * This file is intentionally pure: it does not import the SDK, DOM, or game state.
 * Runtime code injects snapshot functions and exposes one console probe. Tests can
 * feed deterministic snapshots for Basic Launch / disabled / unavailable cases.
 */

export const BASIC_LAUNCH_AD_ERROR = 'adsDisabledBasicLaunch';

function result(status, detail) {
  return Object.freeze({ status, detail });
}

function safeSnapshot(read) {
  try { return typeof read === 'function' ? read() : null; }
  catch (error) {
    return { __snapshotError: String(error?.message || error || 'snapshot failed') };
  }
}

function inspectPlatform(platform, expectCrazyGames) {
  if (platform?.__snapshotError) return result('FAIL', platform.__snapshotError);
  if (expectCrazyGames) {
    if (!platform?.available) return result('FAIL', 'CrazyGames SDK is missing in Preview');
    if (!platform?.initialized) return result('WAIT', 'CrazyGames SDK initialization is still pending');
    if (platform.environment !== 'crazygames')
      return result('FAIL', `Expected crazygames environment, got ${platform.environment}`);
    if (!platform.enabled) return result('FAIL', 'CrazyGames SDK unexpectedly reports disabled');
    return result('PASS', 'CrazyGames SDK is initialized in crazygames environment');
  }

  if (!platform?.available)
    return result('PASS', 'SDK unavailable fallback is active and must remain non-blocking');
  if (platform.environment === 'disabled')
    return result('PASS', 'SDK disabled fallback is active and must remain non-blocking');
  if (!platform.initialized) return result('WAIT', 'SDK initialization has not settled yet');
  return result('PASS', `SDK environment is ${platform.environment}`);
}

function inspectGameplay(platform, gameplay) {
  if (gameplay?.__snapshotError) return result('FAIL', gameplay.__snapshotError);
  if (!gameplay) return result('FAIL', 'Gameplay lifecycle snapshot is unavailable');

  if (!platform?.enabled) {
    return result(
      'PASS',
      'Gameplay lifecycle remains local while SDK is unavailable/disabled',
    );
  }

  if (gameplay.shouldPlay !== gameplay.reportedPlaying)
    return result('WAIT', 'Gameplay start/stop reconciliation is still settling');
  return result('PASS', gameplay.shouldPlay ? 'Gameplay is reported playing' : 'Gameplay is reported stopped');
}

function inspectAudio(audio) {
  if (audio?.__snapshotError) return result('FAIL', audio.__snapshotError);
  if (!audio) return result('FAIL', 'CrazyGames audio lifecycle snapshot is unavailable');

  const reasons = new Set(audio.audio?.reasons || []);
  const hasAdReason = reasons.has('crazygames-ad');
  const hasSettingReason = reasons.has('crazygames-setting');
  if (Boolean(audio.adPlaying) !== hasAdReason)
    return result('FAIL', 'adPlaying and crazygames-ad mute reason disagree');
  if (Boolean(audio.platformMuted) !== hasSettingReason)
    return result('FAIL', 'muteAudio setting and crazygames-setting reason disagree');
  return result('PASS', reasons.size ? `Audio muted by: ${[...reasons].join(', ')}` : 'Audio lifecycle is unmuted');
}

function inspectAd(platform, gameplay, ad) {
  if (ad?.__snapshotError) return result('FAIL', ad.__snapshotError);
  if (!ad) return result('FAIL', 'Midgame ad snapshot is unavailable');
  if (ad.pending) return result('WAIT', 'Midgame ad request is still pending');

  const requests = Number(ad.requestCount || 0);
  const restarts = Number(ad.restartCount || 0);
  if (restarts > requests)
    return result('FAIL', `Restart counter ${restarts} exceeds request counter ${requests}`);
  if (requests > 0 && restarts !== requests)
    return result('FAIL', `Only ${restarts}/${requests} ad requests reached the safe restart path`);

  const last = ad.lastResult || { status: 'idle', error: null };
  if (last.status === 'idle')
    return result('WAIT', 'Die once in Preview to exercise the death → midgame fallback path');

  if (last.error?.code === BASIC_LAUNCH_AD_ERROR) {
    if (!gameplay?.sessionActive)
      return result('WAIT', 'Basic Launch ad was rejected; waiting for the restarted session');
    return result('PASS', 'adsDisabledBasicLaunch was handled and gameplay restarted');
  }

  if (last.status === 'skipped' && !platform?.enabled)
    return result('PASS', 'Disabled/unavailable SDK skipped the ad and gameplay restarted');
  if (last.status === 'finished')
    return result('PASS', 'Midgame ad finished and gameplay restarted');
  if (last.status === 'error')
    return result('PASS', `Ad error ${last.error?.code || 'unknown'} fell through to safe restart`);
  if (last.status === 'cancelled')
    return result('PASS', 'Stale ad request was cancelled without blocking a fresh round');

  return result('WAIT', `Unrecognized ad state: ${last.status}`);
}

export function buildCrazyGamesPreviewQaReport({
  platform = null,
  gameplay = null,
  audio = null,
  ad = null,
  game = null,
  expectCrazyGames = false,
} = {}) {
  const checks = Object.freeze({
    platform: inspectPlatform(platform, expectCrazyGames),
    gameplay: inspectGameplay(platform, gameplay),
    audio: inspectAudio(audio),
    adFallback: inspectAd(platform, gameplay, ad),
  });
  const statuses = Object.values(checks).map(check => check.status);
  const overall = statuses.includes('FAIL') ? 'FAIL' : statuses.includes('WAIT') ? 'WAIT' : 'PASS';

  return Object.freeze({
    phase: 'CG5',
    overall,
    expectCrazyGames: Boolean(expectCrazyGames),
    checks,
    platform,
    gameplay,
    audio,
    ad,
    game,
    previewSteps: Object.freeze([
      'Load the uploaded build in CrazyGames Preview and wait for gameplay.',
      'Run __crazyGamesQA() and verify platform/gameplay/audio are PASS.',
      'Die once; after the result delay verify the game restarts even when the ad is disabled/unfilled.',
      'Run __crazyGamesQA() again; adFallback should become PASS and requestCount === restartCount.',
      'Complete Door 1 → Door 2 → Door 3 → Level 0; requestCount must not increase on the successful ending.',
    ]),
  });
}

export function installCrazyGamesPreviewQa({
  platformSnapshot,
  gameplaySnapshot,
  audioSnapshot,
  adSnapshot,
  gameSnapshot,
  root = globalThis,
} = {}) {
  const expectCrazyGames = () => {
    const host = String(root?.location?.hostname || '').toLowerCase();
    return host === 'crazygames.com' || host.endsWith('.crazygames.com');
  };

  const read = () => buildCrazyGamesPreviewQaReport({
    platform: safeSnapshot(platformSnapshot),
    gameplay: safeSnapshot(gameplaySnapshot),
    audio: safeSnapshot(audioSnapshot),
    ad: safeSnapshot(adSnapshot),
    game: safeSnapshot(gameSnapshot),
    expectCrazyGames: expectCrazyGames(),
  });

  if (root) root.__crazyGamesQA = read;
  return read;
}
