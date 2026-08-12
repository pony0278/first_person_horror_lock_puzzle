/* F2.5 / F2.5R — False Safety Finale companion.
 *
 * Door 3 already owns the authoritative escape clock. This module observes that
 * clock and takes over only after the player honestly crosses the floodgate.
 * F2.5R.3 starts the second escape on the third impact: rupture, shoulder-check,
 * face reveal, and corridor blackout now happen while the player keeps moving.
 */
import {
  DOOR3_FINALE,
  door3FinaleBlackoutLampCount,
  door3FinaleBlackoutProgress,
  door3FinaleBlackoutReady,
  door3FinaleCheckbackYaw,
  door3FinaleClearReady,
  door3FinaleEyeFlash,
  door3FinaleFallProgress,
  door3FinaleFallSlideOffset,
  door3FinaleGateOpenRatio,
  door3FinaleGroundChaseProgress,
  door3FinaleGroundLookYaw,
  door3FinaleImpactCount,
  door3FinaleRunBlackoutClock,
  door3FinaleRunBreakProgress,
  door3FinaleRunFaceProgress,
  door3FinaleRunRevealYaw,
  door3FinaleSecondRunOffset,
  door3FinaleSecondRunProgress,
  door3FinaleSlipProgress,
} from '../logic/door3-finale.js';
import { $fade, $turnCue } from '../dom.js';
import { R, intro, look } from '../state.js';
import { camera } from '../render/scene.js';
import { setPumpHubPuzzleState } from '../render/pumphub.js';
import { resetDoor3FinaleVisual, setDoor3FinaleVisual } from '../render/door3-finale.js';
import { resetDoor3EndingVisual, setDoor3EndingVisual } from '../render/door3-finale-ending.js';
import { setCameraFov } from '../render/viewport.js';
import { actx, beep, wetStep } from './audio.js';
import { endRound } from './round.js';

let started = false;
let activeRound = false;
let crossedAt = null;
let gateSlamPlayed = false;
let lastImpactCount = 0;
let rupturePlayed = false;
let faceCuePlayed = false;
let lastBlackoutLampCount = 0;
let run2StartZ = null;
let run2BaseFov = null;
let fallStartZ = null;
let fallImpactPlayed = false;
let blackCoverActive = false;
let completed = false;
const SECOND_RUN_STEP_SEC = 0.31;

function ensureFinaleState(state) {
  state.finale ??= {
    phase: 'idle',
    gateOpenRatio: 1,
    impactCount: 0,
    breakProgress: 0,
    faceProgress: 0,
    blackoutLamps: 0,
    blackoutProgress: 0,
    secondRunProgress: 0,
    slipProgress: 0,
    fallProgress: 0,
    groundChaseProgress: 0,
    eyeFlash: 0,
  };
  return state.finale;
}

function clearFinaleCover() {
  if (!blackCoverActive) return;
  blackCoverActive = false;
  $fade.classList.remove('on');
  $fade.style.transition = '';
  $fade.style.opacity = '';
  $fade.querySelector('div').textContent = '';
}

function resetRuntime(state) {
  crossedAt = null;
  gateSlamPlayed = false;
  lastImpactCount = 0;
  rupturePlayed = false;
  faceCuePlayed = false;
  lastBlackoutLampCount = 0;
  run2StartZ = null;
  run2BaseFov = null;
  fallStartZ = null;
  fallImpactPlayed = false;
  completed = false;
  clearFinaleCover();
  resetDoor3FinaleVisual();
  resetDoor3EndingVisual();
  if (state) Object.assign(ensureFinaleState(state), {
    phase: 'idle',
    gateOpenRatio: 1,
    impactCount: 0,
    breakProgress: 0,
    faceProgress: 0,
    blackoutLamps: 0,
    blackoutProgress: 0,
    secondRunProgress: 0,
    slipProgress: 0,
    fallProgress: 0,
    groundChaseProgress: 0,
    eyeFlash: 0,
  });
}

function syncGate(state, ratio) {
  const gateOpenRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
  state.pump.doorOpenRatio = gateOpenRatio;
  setPumpHubPuzzleState({
    latchStates: state.pump.latchStates,
    selectedSource: state.pump.selectedSource,
    leverUnlocked: state.pump.leverUnlocked,
    leverPulled: state.pump.leverPulled,
    doorOpenRatio: gateOpenRatio,
  });
  ensureFinaleState(state).gateOpenRatio = gateOpenRatio;
}

/** Heavy procedural impact; every sound also has a visible gate deformation. */
function gateBang(strength = 1) {
  beep(strength > 1.15 ? 'severe' : 'thunk');
  const context = actx;
  if (!context || context.state !== 'running') return;
  const now = context.currentTime;
  const osc = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(72 - Math.min(18, strength * 8), now);
  osc.frequency.exponentialRampToValueAtTime(35, now + 0.24);
  filter.type = 'lowpass';
  filter.frequency.value = 230 + strength * 70;
  gain.gain.setValueAtTime(Math.min(0.20, 0.075 + strength * 0.055), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.30);
  osc.connect(filter); filter.connect(gain); gain.connect(context.destination);
  osc.start(now); osc.stop(now + 0.32);
}

/** Short electrical death snap. Muted players still see the exact lamp go dark. */
function blackoutSnap(index) {
  const context = actx;
  if (!context || context.state !== 'running') return;
  const now = context.currentTime;
  const osc = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  osc.type = index % 2 ? 'square' : 'sawtooth';
  osc.frequency.setValueAtTime(Math.max(420, 1120 - index * 86), now);
  osc.frequency.exponentialRampToValueAtTime(170, now + 0.075);
  filter.type = 'bandpass';
  filter.frequency.value = 1250;
  gain.gain.setValueAtTime(0.036 + index * 0.002, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.10);
  osc.connect(filter); filter.connect(gain); gain.connect(context.destination);
  osc.start(now); osc.stop(now + 0.11);
}

/** Wet skid into a low body-impact thump. */
function bodyImpact() {
  wetStep(1.55);
  beep('thunk');
  const context = actx;
  if (!context || context.state !== 'running') return;
  const now = context.currentTime;
  const osc = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(62, now);
  osc.frequency.exponentialRampToValueAtTime(31, now + 0.26);
  filter.type = 'lowpass';
  filter.frequency.value = 180;
  gain.gain.setValueAtTime(0.13, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
  osc.connect(filter); filter.connect(gain); gain.connect(context.destination);
  osc.start(now); osc.stop(now + 0.36);
}

function beginCheckback(state) {
  state.phase = 'finale-checkback';
  state.t = 0;
  ensureFinaleState(state).phase = 'checkback';
  intro.active = true;
  intro.phase = 'run';
  intro.bobY = 0;
  intro.roll = 0;
  look.holding = false;
  look.yaw = 0;
  look.target = 0;
  $turnCue.textContent = '';
}

function updateEscape(state) {
  if (!state.escape.crossed) return;
  if (crossedAt === null) {
    crossedAt = state.t;
    ensureFinaleState(state).phase = 'gate-slam';
  }
  const afterCross = Math.max(0, state.t - crossedAt);
  const gateRatio = door3FinaleGateOpenRatio(afterCross);
  syncGate(state, gateRatio);
  if (gateRatio <= 0.01 && !gateSlamPlayed) {
    gateSlamPlayed = true;
    state.fx.shake = Math.max(state.fx.shake, 0.82);
    gateBang(0.82);
  }
}

function beginRunFirstReveal(state, finale) {
  state.phase = 'finale-run2';
  state.t = 0;
  state.stepT = 0;
  run2StartZ = intro.z;
  run2BaseFov = camera.fov;
  rupturePlayed = false;
  faceCuePlayed = false;
  lastBlackoutLampCount = 0;
  intro.active = true;
  intro.phase = 'run';
  intro.bobPhase = 0;
  intro.bobY = 0;
  intro.roll = 0;
  intro.arriveF = 0;
  look.holding = false;
  look.yaw = 180;
  look.target = 180;
  Object.assign(finale, {
    phase: 'run2',
    impactCount: 3,
    breakProgress: 0,
    faceProgress: 0,
    blackoutLamps: 0,
    blackoutProgress: 0,
    secondRunProgress: 0,
    slipProgress: 0,
    fallProgress: 0,
    groundChaseProgress: 0,
    eyeFlash: 0,
  });
  $turnCue.textContent = '';
}

function updateCheckback(state) {
  const time = state.t;
  const impacts = door3FinaleImpactCount(time);
  const yaw = door3FinaleCheckbackYaw(time);

  look.yaw = yaw;
  look.target = yaw;
  intro.bobY *= 0.82;
  intro.roll *= 0.78;

  if (impacts > lastImpactCount) {
    for (let impact = lastImpactCount + 1; impact <= impacts; impact++) {
      state.fx.shake = Math.max(state.fx.shake, 0.72 + impact * 0.27);
      gateBang(0.74 + impact * 0.22);
    }
    lastImpactCount = impacts;
  }

  const finale = ensureFinaleState(state);
  Object.assign(finale, {
    phase: 'checkback',
    impactCount: impacts,
    breakProgress: 0,
    faceProgress: 0,
    blackoutLamps: 0,
    blackoutProgress: 0,
    secondRunProgress: 0,
    slipProgress: 0,
    fallProgress: 0,
    groundChaseProgress: 0,
    eyeFlash: 0,
  });
  setDoor3FinaleVisual({ impacts, breakProgress: 0, faceProgress: 0, time });
  setDoor3EndingVisual();

  // F2.5R.3: the third blow is the decision point. Do not stand around waiting
  // for rupture or a face hold; the body commits to the second escape now.
  if (impacts >= 3) beginRunFirstReveal(state, finale);
}

function beginFall(state) {
  state.phase = 'finale-fall';
  state.t = 0;
  fallStartZ = intro.z;
  fallImpactPlayed = false;
  state.stepT = 0;
  ensureFinaleState(state).phase = 'fall';
  look.holding = false;
  $turnCue.textContent = '';
  wetStep(1.34);
}

function updateSecondRun(state, dt) {
  const time = state.t;
  const progress = door3FinaleSecondRunProgress(time);
  const slipProgress = door3FinaleSlipProgress(progress);
  const breakProgress = door3FinaleRunBreakProgress(time);
  const faceProgress = door3FinaleRunFaceProgress(time);
  const blackoutClock = door3FinaleRunBlackoutClock(time);
  const blackoutLamps = door3FinaleBlackoutLampCount(blackoutClock);
  const blackoutProgress = door3FinaleBlackoutProgress(blackoutClock);
  const chaseProgress = blackoutProgress * (0.26 + progress * 0.74);
  const yaw = door3FinaleRunRevealYaw(time);

  if (breakProgress > 0.01 && !rupturePlayed) {
    rupturePlayed = true;
    state.fx.shake = Math.max(state.fx.shake, 1.72);
    gateBang(1.42);
  }
  if (faceProgress > 0.02 && !faceCuePlayed) {
    faceCuePlayed = true;
    beep('face');
  }
  if (blackoutLamps > lastBlackoutLampCount) {
    for (let lamp = lastBlackoutLampCount; lamp < blackoutLamps; lamp++) {
      blackoutSnap(lamp);
      state.fx.shake = Math.max(state.fx.shake, 0.10 + lamp * 0.025);
    }
    lastBlackoutLampCount = blackoutLamps;
  }

  intro.active = true;
  intro.phase = 'run';
  intro.x = 0;
  intro.z = (run2StartZ ?? intro.z) + door3FinaleSecondRunOffset(time);
  intro.bobPhase += dt * 9.0;
  intro.bobY = Math.sin(intro.bobPhase * 2) * 0.061;
  intro.roll = Math.sin(intro.bobPhase) * 1.35 +
    Math.sin(time * 1.9) * 0.10 * faceProgress;
  intro.arriveF = 0;
  look.yaw = yaw;
  look.target = yaw;
  look.holding = false;

  state.stepT += dt;
  while (state.stepT >= SECOND_RUN_STEP_SEC) {
    state.stepT -= SECOND_RUN_STEP_SEC;
    wetStep(1.18);
  }
  state.fx.shake = Math.max(state.fx.shake, 0.13 + blackoutProgress * 0.08);
  if (run2BaseFov !== null) {
    const sprintIn = Math.min(1, time / 0.34);
    setCameraFov(run2BaseFov + 4.2 * sprintIn);
  }

  Object.assign(ensureFinaleState(state), {
    phase: 'run2',
    impactCount: 3,
    breakProgress,
    faceProgress,
    blackoutLamps,
    blackoutProgress,
    secondRunProgress: progress,
    slipProgress,
    fallProgress: 0,
    groundChaseProgress: 0,
    eyeFlash: 0,
  });
  setDoor3FinaleVisual({
    impacts: 3,
    breakProgress,
    faceProgress,
    blackoutLamps,
    blackoutProgress,
    chaseProgress,
    time,
  });
  setDoor3EndingVisual({ slipProgress, time });

  if (progress >= 1) beginFall(state);
}

function updateFall(state) {
  const time = state.t;
  const fallProgress = door3FinaleFallProgress(time);
  const slideOffset = door3FinaleFallSlideOffset(time);
  const baseZ = fallStartZ ?? intro.z;

  intro.active = true;
  intro.phase = 'run';
  intro.x = 0;
  intro.z = baseZ + slideOffset;
  intro.arriveF = fallProgress;
  intro.bobY = -DOOR3_FINALE.fallCameraDrop * fallProgress +
    Math.sin(fallProgress * Math.PI) * 0.035;
  intro.roll = DOOR3_FINALE.fallRollDeg * fallProgress;
  look.yaw = DOOR3_FINALE.fallTwistDeg * fallProgress;
  look.target = look.yaw;
  look.holding = false;
  state.fx.shake = Math.max(state.fx.shake, 0.14 + fallProgress * 0.20);

  if (run2BaseFov !== null)
    setCameraFov(run2BaseFov + 4.2 * (1 - fallProgress));

  Object.assign(ensureFinaleState(state), {
    phase: 'fall',
    impactCount: 3,
    breakProgress: 1,
    faceProgress: 1,
    blackoutLamps: DOOR3_FINALE.blackoutLampCount,
    blackoutProgress: 1,
    secondRunProgress: 1,
    slipProgress: 1,
    fallProgress,
    groundChaseProgress: 0,
    eyeFlash: 0,
  });
  setDoor3FinaleVisual({
    impacts: 3,
    breakProgress: 1,
    faceProgress: 1,
    blackoutLamps: DOOR3_FINALE.blackoutLampCount,
    blackoutProgress: 1,
    chaseProgress: 1,
    time: DOOR3_FINALE.secondRunSec + time,
  });
  setDoor3EndingVisual({ slipProgress: 1, time });

  if (fallProgress >= 1) {
    if (!fallImpactPlayed) {
      fallImpactPlayed = true;
      state.fx.shake = Math.max(state.fx.shake, 1.25);
      bodyImpact();
    }
    state.phase = 'finale-ground';
    state.t = 0;
    ensureFinaleState(state).phase = 'ground';
    intro.z = baseZ - DOOR3_FINALE.fallSlideDistance;
    intro.bobY = -DOOR3_FINALE.fallCameraDrop;
    intro.roll = DOOR3_FINALE.fallRollDeg;
    look.yaw = DOOR3_FINALE.fallTwistDeg;
    look.target = look.yaw;
  }
}

function beginFinalBlack(state) {
  state.phase = 'finale-black';
  state.t = 0;
  ensureFinaleState(state).phase = 'black';
  setDoor3EndingVisual({ slipProgress: 1, groundChaseProgress: 1, eyeFlash: 0 });
  $fade.querySelector('div').textContent = '';
  $fade.style.transition = 'none';
  $fade.style.opacity = '1';
  $fade.classList.add('on');
  blackCoverActive = true;
}

function updateGround(state) {
  const time = state.t;
  const chaseProgress = door3FinaleGroundChaseProgress(time);
  const eyeFlash = door3FinaleEyeFlash(time);
  const yaw = door3FinaleGroundLookYaw(time);

  intro.active = true;
  intro.phase = 'run';
  intro.arriveF = 1;
  intro.bobY = -DOOR3_FINALE.fallCameraDrop + Math.sin(time * 5.2) * 0.004;
  intro.roll = DOOR3_FINALE.fallRollDeg + 4.5 * chaseProgress;
  look.yaw = yaw;
  look.target = yaw;
  look.holding = false;
  state.fx.shake = Math.max(state.fx.shake, 0.05 + eyeFlash * 0.42);

  if (run2BaseFov !== null) setCameraFov(run2BaseFov - 1.4 * chaseProgress);

  Object.assign(ensureFinaleState(state), {
    phase: 'ground',
    impactCount: 3,
    breakProgress: 1,
    faceProgress: 1,
    blackoutLamps: DOOR3_FINALE.blackoutLampCount,
    blackoutProgress: 1,
    secondRunProgress: 1,
    slipProgress: 1,
    fallProgress: 1,
    groundChaseProgress: chaseProgress,
    eyeFlash,
  });
  setDoor3FinaleVisual({
    impacts: 3,
    breakProgress: 1,
    faceProgress: 1,
    blackoutLamps: DOOR3_FINALE.blackoutLampCount,
    blackoutProgress: 1,
    chaseProgress: 1,
    time: DOOR3_FINALE.secondRunSec + time,
  });
  setDoor3EndingVisual({
    slipProgress: 1,
    groundChaseProgress: chaseProgress,
    eyeFlash,
    time,
  });

  if (door3FinaleBlackoutReady(time)) beginFinalBlack(state);
}

function updateFinalBlack(state) {
  setDoor3EndingVisual({ slipProgress: 1, groundChaseProgress: 1, eyeFlash: 0 });
  if (!door3FinaleClearReady(state.t) || completed) return;

  completed = true;
  state.escape.complete = true;
  ensureFinaleState(state).phase = 'complete';
  intro.active = false;
  intro.bobY = 0;
  intro.roll = 0;
  intro.arriveF = 0;
  if (run2BaseFov !== null) setCameraFov(run2BaseFov);
  R.elapsed = R.timer.elapsed;

  // The cover is already fully black. Restore normal CSS transition metadata
  // without removing the cover, then let endRound place the result text on it.
  $fade.style.transition = '';
  $fade.style.opacity = '';
  endRound(state.escape.clutch ? '極限逃脫' : '逃脫成功');
}

function applyFrame(state) {
  if (!state?.active) {
    if (activeRound) resetRuntime(state);
    activeRound = false;
    return;
  }
  if (!activeRound) {
    resetRuntime(state);
    activeRound = true;
  }

  if (state.phase === 'escape') updateEscape(state);
  // Existing Door 3 enters breathe after the first run. Hijack that exact beat
  // before it can complete, preserving the physical escape path up to this point.
  else if (state.phase === 'breathe' && state.escape.crossed && !completed) beginCheckback(state);
  else if (state.phase === 'finale-checkback') updateCheckback(state);
  else if (state.phase === 'finale-fall') updateFall(state);
  else if (state.phase === 'finale-ground') updateGround(state);
  else if (state.phase === 'finale-black') updateFinalBlack(state);
}

export function startDoor3FalseSafetyFinale(getDoor3State) {
  if (started || typeof requestAnimationFrame !== 'function') return;
  started = true;
  let previousAt = null;
  const frame = frameAt => {
    const now = Number.isFinite(frameAt) ? frameAt : performance.now();
    const dt = previousAt === null ? 0 : Math.min(0.05, Math.max(0, (now - previousAt) / 1000));
    previousAt = now;
    const state = getDoor3State?.();
    if (state?.phase === 'finale-run2') updateSecondRun(state, dt);
    else applyFrame(state);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function door3FinaleSnapshot(state) {
  if (!state) return null;
  const finale = ensureFinaleState(state);
  return { ...finale };
}
