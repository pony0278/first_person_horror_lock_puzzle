/* F2.5R.6 — Door 3 noclip cliffhanger controller.
 *
 * The existing false-safety finale keeps ownership of the chase until the player
 * has finished the moving shoulder-check. At ~3 seconds into the second sprint
 * this companion changes the phase, so the legacy fall / ground path is never
 * reached. Black is the only transition: no portal, no fall, no collision.
 */
import {
  DOOR3_LEVEL0_FINALE,
  door3Level0CompleteReady,
  door3Level0HumReady,
  door3Level0NoclipReady,
  door3Level0OutroReady,
  door3Level0RevealReady,
} from '../logic/door3-level0-finale.js';
import { $fade, $turnCue } from '../dom.js';
import { R, intro, look } from '../state.js';
import { camera } from '../render/scene.js';
import {
  resetDoor3Level0Visual,
  setDoor3Level0Visual,
  startDoor3Level0Renderer,
} from '../render/door3-level0.js';
import { resetDoor3EndingVisual } from '../render/door3-finale-ending.js';
import { resetDoor3ThreatIsolation } from '../render/door3-threat-isolation.js';
import { setCameraFov } from '../render/viewport.js';
import { actx } from './audio.js';
import { endRound } from './round.js';

let started = false;
let completed = false;
let ownsCover = false;
let anchorX = 0;
let anchorZ = 0;
let previousFov = 55;
let hum = null;

function coverBlack(durationMs = 0) {
  ownsCover = true;
  $fade.querySelector('div').textContent = '';
  $fade.style.transition = durationMs > 0 ? `opacity ${durationMs}ms linear` : 'none';
  $fade.style.opacity = '1';
  $fade.classList.add('on');
}

function revealFromBlack(durationMs = 120) {
  $fade.querySelector('div').textContent = '';
  $fade.style.transition = `opacity ${durationMs}ms linear`;
  $fade.style.opacity = '0';
  $fade.classList.remove('on');
}

function clearOwnedCover() {
  if (!ownsCover) return;
  ownsCover = false;
  $fade.classList.remove('on');
  $fade.style.transition = '';
  $fade.style.opacity = '';
  $fade.querySelector('div').textContent = '';
}

function startFluorescentHum() {
  if (hum) return;
  const context = actx;
  if (!context || context.state !== 'running') return;

  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  const oscillators = [59.7, 119.4].map((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = index ? 'triangle' : 'sine';
    oscillator.frequency.value = frequency;
    oscillator.connect(filter);
    oscillator.start();
    return oscillator;
  });
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  filter.Q.value = 0.6;
  filter.connect(gain);
  gain.connect(context.destination);
  const now = context.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.022, now + 0.16);
  hum = { context, gain, oscillators };
}

function stopFluorescentHum() {
  if (!hum) return;
  const { context, gain, oscillators } = hum;
  hum = null;
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value || 0.0001), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  oscillators.forEach(oscillator => {
    try { oscillator.stop(now + 0.14); } catch {}
  });
}

function resetRuntime() {
  completed = false;
  anchorX = 0;
  anchorZ = 0;
  previousFov = 55;
  stopFluorescentHum();
  resetDoor3Level0Visual();
  clearOwnedCover();
}

function beginNoclipBlack(state) {
  state.phase = 'finale-noclip-black';
  state.t = 0;
  if (state.finale) state.finale.phase = 'noclip-black';
  anchorX = Number(intro.x) || 0;
  anchorZ = Number(intro.z) || 0;
  previousFov = camera.fov;

  intro.active = true;
  intro.x = anchorX;
  intro.z = anchorZ;
  intro.bobY = 0;
  intro.roll = 0;
  intro.arriveF = 0;
  look.holding = false;
  look.yaw = 0;
  look.target = 0;
  $turnCue.textContent = '';

  resetDoor3ThreatIsolation();
  resetDoor3EndingVisual();
  resetDoor3Level0Visual();
  coverBlack(70);
}

function updateNoclipBlack(state) {
  intro.active = true;
  intro.x = anchorX;
  intro.z = anchorZ;
  intro.bobY = 0;
  intro.roll = 0;
  look.yaw = 0;
  look.target = 0;

  if (door3Level0HumReady(state.t)) startFluorescentHum();
  if (!door3Level0RevealReady(state.t)) return;

  state.phase = 'finale-level0';
  state.t = 0;
  if (state.finale) state.finale.phase = 'level0';
  setDoor3Level0Visual({ visible: true, anchorX, anchorZ, elapsed: 0 });
  setCameraFov(70);
  revealFromBlack(DOOR3_LEVEL0_FINALE.revealSec * 1000);
}

function updateLevel0(state) {
  intro.active = true;
  intro.x = anchorX;
  intro.z = anchorZ;
  intro.arriveF = 0;
  intro.bobY = Math.sin(state.t * 1.65) * 0.006;
  intro.roll = Math.sin(state.t * 0.72) * 0.12;
  look.holding = false;
  look.yaw = 0;
  look.target = 0;
  setDoor3Level0Visual({ visible: true, anchorX, anchorZ, elapsed: state.t });

  if (!door3Level0OutroReady(state.t)) return;
  state.phase = 'finale-level0-outro';
  state.t = 0;
  if (state.finale) state.finale.phase = 'level0-outro';
  coverBlack(DOOR3_LEVEL0_FINALE.outroFadeSec * 1000);
}

function updateLevel0Outro(state) {
  intro.active = true;
  intro.x = anchorX;
  intro.z = anchorZ;
  intro.bobY = 0;
  intro.roll = 0;
  look.yaw = 0;
  look.target = 0;
  setDoor3Level0Visual({ visible: true, anchorX, anchorZ, elapsed: state.t });

  if (!door3Level0CompleteReady(state.t) || completed) return;
  completed = true;
  stopFluorescentHum();
  resetDoor3Level0Visual();
  state.escape.complete = true;
  if (state.finale) state.finale.phase = 'complete';
  intro.active = false;
  intro.bobY = 0;
  intro.roll = 0;
  intro.arriveF = 0;
  setCameraFov(previousFov);
  R.elapsed = R.timer.elapsed;

  // Keep the screen black and let the normal result UI write onto that cover.
  $fade.style.transition = '';
  $fade.style.opacity = '';
  endRound('未完待續');
}

function applyFrame(state) {
  if (!state?.active) {
    resetRuntime();
    return;
  }

  if (state.phase === 'finale-run2' && door3Level0NoclipReady(state.t)) {
    beginNoclipBlack(state);
  } else if (state.phase === 'finale-noclip-black') {
    updateNoclipBlack(state);
  } else if (state.phase === 'finale-level0') {
    updateLevel0(state);
  } else if (state.phase === 'finale-level0-outro') {
    updateLevel0Outro(state);
  }
}

export function startDoor3Level0NoclipFinale(getDoor3State) {
  if (started || typeof requestAnimationFrame !== 'function') return;
  started = true;
  startDoor3Level0Renderer();
  const frame = () => {
    applyFrame(getDoor3State?.());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
