/* F2.5 — False Safety Finale companion.
 *
 * Door 3 already owns the authoritative escape clock. This module observes that
 * clock and takes over only after the player honestly crosses the floodgate.
 * It therefore cannot grant an early escape or bypass the existing pursuit.
 */
import {
  DOOR3_FINALE,
  door3FinaleBlackoutLampCount,
  door3FinaleBlackoutProgress,
  door3FinaleBreakProgress,
  door3FinaleCheckbackYaw,
  door3FinaleEscapeYaw,
  door3FinaleFaceProgress,
  door3FinaleGateOpenRatio,
  door3FinaleImpactCount,
  door3FinaleSecondRunOffset,
  door3FinaleSecondRunProgress,
} from '../logic/door3-finale.js';
import { $turnCue } from '../dom.js';
import { R, intro, look } from '../state.js';
import { camera } from '../render/scene.js';
import { setPumpHubPuzzleState } from '../render/pumphub.js';
import { resetDoor3FinaleVisual, setDoor3FinaleVisual } from '../render/door3-finale.js';
import { setCameraFov } from '../render/viewport.js';
import { actx, beep, wetStep } from './audio.js';
import { endRound } from './round.js';

let started = false;
let activeRound = false;
let crossedAt = null;
let gateSlamPlayed = false;
let lastImpactCount = 0;
let rupturePlayed = false;
let lastBlackoutLampCount = 0;
let run2StartZ = null;
let run2BaseFov = null;
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
  };
  return state.finale;
}

function resetRuntime(state) {
  crossedAt = null;
  gateSlamPlayed = false;
  lastImpactCount = 0;
  rupturePlayed = false;
  lastBlackoutLampCount = 0;
  run2StartZ = null;
  run2BaseFov = null;
  completed = false;
  resetDoor3FinaleVisual();
  if (state) Object.assign(ensureFinaleState(state), {
    phase: 'idle',
    gateOpenRatio: 1,
    impactCount: 0,
    breakProgress: 0,
    faceProgress: 0,
    blackoutLamps: 0,
    blackoutProgress: 0,
    secondRunProgress: 0,
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

function updateCheckback(state) {
  const time = state.t;
  const impacts = door3FinaleImpactCount(time);
  const yaw = door3FinaleCheckbackYaw(time);
  const breakProgress = door3FinaleBreakProgress(time);

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

  if (breakProgress > 0.01 && !rupturePlayed) {
    rupturePlayed = true;
    state.fx.shake = Math.max(state.fx.shake, 1.72);
    gateBang(1.42);
  }

  const finale = ensureFinaleState(state);
  Object.assign(finale, {
    phase: breakProgress > 0 ? 'rupture' : 'checkback',
    impactCount: impacts,
    breakProgress,
    faceProgress: 0,
    blackoutLamps: 0,
    blackoutProgress: 0,
    secondRunProgress: 0,
  });
  setDoor3FinaleVisual({ impacts, breakProgress, faceProgress: 0, time });

  if (breakProgress >= 1) {
    state.phase = 'finale-face';
    state.t = 0;
    finale.phase = 'face';
    look.yaw = 180;
    look.target = 180;
    beep('face');
  }
}

function beginBlackout(state) {
  state.phase = 'finale-blackout';
  state.t = 0;
  lastBlackoutLampCount = 0;
  run2StartZ = intro.z;
  run2BaseFov = camera.fov;
  const finale = ensureFinaleState(state);
  Object.assign(finale, {
    phase: 'blackout',
    blackoutLamps: 0,
    blackoutProgress: 0,
    secondRunProgress: 0,
  });
  look.holding = false;
  look.yaw = 180;
  look.target = 180;
  intro.active = true;
  intro.phase = 'run';
  intro.bobY = 0;
  intro.roll = 0;
  state.stepT = 0;
  $turnCue.textContent = '';
}

function updateFace(state) {
  const time = state.t;
  const faceProgress = door3FinaleFaceProgress(time);
  look.yaw = 180;
  look.target = 180;
  intro.bobY = Math.sin(time * 1.7) * 0.006;
  intro.roll = Math.sin(time * 1.15) * 0.18 * faceProgress;
  state.fx.shake = Math.max(state.fx.shake, faceProgress * 0.08);

  Object.assign(ensureFinaleState(state), {
    phase: 'face',
    impactCount: 3,
    breakProgress: 1,
    faceProgress,
    blackoutLamps: 0,
    blackoutProgress: 0,
    secondRunProgress: 0,
  });
  setDoor3FinaleVisual({ impacts: 3, breakProgress: 1, faceProgress, time });

  if (time >= DOOR3_FINALE.faceHoldSec) beginBlackout(state);
}

function updateBlackout(state) {
  const time = state.t;
  const blackoutLamps = door3FinaleBlackoutLampCount(time);
  const blackoutProgress = door3FinaleBlackoutProgress(time);
  const yaw = door3FinaleEscapeYaw(time);

  if (blackoutLamps > lastBlackoutLampCount) {
    for (let lamp = lastBlackoutLampCount; lamp < blackoutLamps; lamp++) {
      blackoutSnap(lamp);
      state.fx.shake = Math.max(state.fx.shake, 0.10 + lamp * 0.025);
    }
    lastBlackoutLampCount = blackoutLamps;
  }

  look.yaw = yaw;
  look.target = yaw;
  intro.bobY = Math.sin(time * 2.2) * 0.004;
  intro.roll = Math.sin(time * 1.7) * 0.10 * blackoutProgress;

  Object.assign(ensureFinaleState(state), {
    phase: 'blackout',
    impactCount: 3,
    breakProgress: 1,
    faceProgress: 1,
    blackoutLamps,
    blackoutProgress,
    secondRunProgress: 0,
  });
  setDoor3FinaleVisual({
    impacts: 3,
    breakProgress: 1,
    faceProgress: 1,
    blackoutLamps,
    blackoutProgress,
    chaseProgress: 0,
    time,
  });

  if (time >= DOOR3_FINALE.secondRunStartSec) {
    state.phase = 'finale-run2';
    state.t = 0;
    state.stepT = 0;
    intro.bobPhase = 0;
    look.yaw = 0;
    look.target = 0;
    ensureFinaleState(state).phase = 'run2';
    beep('face');
  }
}

function updateSecondRun(state, dt) {
  const time = state.t;
  const progress = door3FinaleSecondRunProgress(time);
  const blackoutClock = DOOR3_FINALE.secondRunStartSec + time;
  const blackoutLamps = door3FinaleBlackoutLampCount(blackoutClock);
  const blackoutProgress = door3FinaleBlackoutProgress(blackoutClock);
  const chaseProgress = 0.28 + progress * 0.72;

  if (blackoutLamps > lastBlackoutLampCount) {
    for (let lamp = lastBlackoutLampCount; lamp < blackoutLamps; lamp++) blackoutSnap(lamp);
    lastBlackoutLampCount = blackoutLamps;
  }

  intro.active = true;
  intro.phase = 'run';
  intro.x = 0;
  intro.z = (run2StartZ ?? intro.z) + door3FinaleSecondRunOffset(time);
  intro.bobPhase += dt * 9.0;
  intro.bobY = Math.sin(intro.bobPhase * 2) * 0.061;
  intro.roll = Math.sin(intro.bobPhase) * 1.35;
  look.yaw = 0;
  look.target = 0;
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
    breakProgress: 1,
    faceProgress: 1,
    blackoutLamps,
    blackoutProgress,
    secondRunProgress: progress,
  });
  setDoor3FinaleVisual({
    impacts: 3,
    breakProgress: 1,
    faceProgress: 1,
    blackoutLamps,
    blackoutProgress,
    chaseProgress,
    time: blackoutClock,
  });

  if (progress >= 1) {
    state.phase = 'finale-run2-settle';
    state.t = 0;
    ensureFinaleState(state).phase = 'run2-settle';
    intro.bobY = 0;
    intro.roll = 0;
  }
}

function updateSecondRunSettle(state) {
  const time = state.t;
  const settle = Math.max(0, 1 - time / DOOR3_FINALE.secondRunSettleSec);
  intro.bobY *= settle;
  intro.roll *= settle;
  look.yaw = 0;
  look.target = 0;
  if (run2BaseFov !== null) setCameraFov(run2BaseFov + 4.2 * settle);

  setDoor3FinaleVisual({
    impacts: 3,
    breakProgress: 1,
    faceProgress: 1,
    blackoutLamps: DOOR3_FINALE.blackoutLampCount,
    blackoutProgress: 1,
    chaseProgress: 1,
    time: DOOR3_FINALE.secondRunStartSec + DOOR3_FINALE.secondRunSec + time,
  });

  // F2.5.4 will replace this release with the fall + final glimpse. For now the
  // second escape remains a complete playable endpoint instead of dead-ending.
  if (time >= DOOR3_FINALE.secondRunSettleSec && !completed) {
    completed = true;
    state.escape.complete = true;
    ensureFinaleState(state).phase = 'temporary-post-run-complete';
    intro.active = false;
    intro.bobY = 0;
    intro.roll = 0;
    if (run2BaseFov !== null) setCameraFov(run2BaseFov);
    R.elapsed = R.timer.elapsed;
    endRound(state.escape.clutch ? '極限逃脫' : '逃脫成功');
  }
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
  else if (state.phase === 'finale-face') updateFace(state);
  else if (state.phase === 'finale-blackout') updateBlackout(state);
  else if (state.phase === 'finale-run2') updateSecondRun(state, 1 / 60);
  else if (state.phase === 'finale-run2-settle') updateSecondRunSettle(state);
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
