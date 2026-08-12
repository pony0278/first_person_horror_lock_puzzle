/* F2.5 — False Safety Finale companion.
 *
 * Door 3 already owns the authoritative escape clock. This module observes that
 * clock and takes over only after the player honestly crosses the floodgate.
 * It therefore cannot grant an early escape or bypass the existing pursuit.
 */
import {
  DOOR3_FINALE,
  door3FinaleBreakProgress,
  door3FinaleCheckbackYaw,
  door3FinaleFaceProgress,
  door3FinaleGateOpenRatio,
  door3FinaleImpactCount,
} from '../logic/door3-finale.js';
import { $turnCue } from '../dom.js';
import { R, intro, look } from '../state.js';
import { setPumpHubPuzzleState } from '../render/pumphub.js';
import { resetDoor3FinaleVisual, setDoor3FinaleVisual } from '../render/door3-finale.js';
import { actx, beep } from './audio.js';
import { endRound } from './round.js';

let started = false;
let activeRound = false;
let crossedAt = null;
let gateSlamPlayed = false;
let lastImpactCount = 0;
let rupturePlayed = false;
let completed = false;

function ensureFinaleState(state) {
  state.finale ??= {
    phase: 'idle',
    gateOpenRatio: 1,
    impactCount: 0,
    breakProgress: 0,
    faceProgress: 0,
  };
  return state.finale;
}

function resetRuntime(state) {
  crossedAt = null;
  gateSlamPlayed = false;
  lastImpactCount = 0;
  rupturePlayed = false;
  completed = false;
  resetDoor3FinaleVisual();
  if (state) Object.assign(ensureFinaleState(state), {
    phase: 'idle',
    gateOpenRatio: 1,
    impactCount: 0,
    breakProgress: 0,
    faceProgress: 0,
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
  });
  setDoor3FinaleVisual({ impacts: 3, breakProgress: 1, faceProgress, time });

  // Temporary bridge while F2.5.3 is not implemented yet. The next phase will
  // replace this completion with corridor blackout + second escape.
  if (time >= DOOR3_FINALE.faceHoldSec && !completed) {
    completed = true;
    state.escape.complete = true;
    ensureFinaleState(state).phase = 'temporary-complete';
    intro.active = false;
    intro.bobY = 0;
    intro.roll = 0;
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
}

export function startDoor3FalseSafetyFinale(getDoor3State) {
  if (started || typeof requestAnimationFrame !== 'function') return;
  started = true;
  const frame = () => {
    applyFrame(getDoor3State?.());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function door3FinaleSnapshot(state) {
  if (!state) return null;
  const finale = ensureFinaleState(state);
  return { ...finale };
}
