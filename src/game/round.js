/* 回合生命週期：開新局、勝、敗、結算。
   純邏輯的部分（計時器、失敗原因、站位時刻表）在 src/logic/round.ts。 */

import { CFG } from '../logic/config.js';
import { LockState } from '../logic/lock.js';
import { createPinPuzzle } from '../logic/pin-puzzle.js';
import { door2Cause, primaryCause as primaryCauseOf, stationThresholds } from '../logic/round.js';
import { $fade } from '../dom.js';
import { buildPins, flashTrack, renderPins } from '../render/cutaway.js';
import { decay, decayGroup, reflection } from '../render/decay.js';
import { repaint } from '../render/hintwall.js';
import { monster } from '../render/monster.js';
import { door, doorLever, keyEye, pickTool, scene, wrench } from '../render/scene.js';
import { R, ST, anim, hooks, intro, look, ui } from '../state.js';
import { beep } from './audio.js';

const ROUND_PAUSE = 'round';
let restartTimer = null;

/** 開始一扇門自己的威脅回合；跨門環境衰變由呼叫端保留。 */
export function beginDoorRound(door, limit, frontPool, hold = CFG.stations.hold) {
  R.door = door; R.limit = limit;
  R.timer.resume(ROUND_PAUSE);
  R.timer.start(); R.elapsed = 0;
  R.over = false; R.won = false;
  R.lookTime = 0; R.jamTime = 0; R.jamStart = 0;
  R.errorCount = 0; R.severeCount = 0;
  R.history = []; ui.sel = 0;
  look.yaw = 0; look.target = 0; look.holding = false;

  const S = CFG.stations;
  ST.thresholds = stationThresholds(hold, limit);
  ST.index = 0; ST.z = S.z[0]; ST.targetZ = S.z[0];
  monster.visible = false;
  ST.moveT = 0; ST.pendingJump = false;
  ST.stareT = 0; ST.blink = 0; ST.seen = false;
  ST.phase = 'off'; ST.emptyGot = 0; ST.glanceT = 0; ST.counted = false;
  ST.faceT = 0; ST.faceMode = 0; ST.readyOff = false; ST.armedT = 0;
  ST.front = null; ST.frontT = 0; ST.frontCool = 0;
  ST.frontLeft = S.frontMin + Math.floor(Math.random() * (S.frontMax - S.frontMin + 1));
  ST.frontPool = frontPool.slice().sort(() => Math.random() - 0.5);
  keyEye.visible = false;
  reflection.mesh.visible = false; reflection.mat.opacity = 0;
  ST.emptyNeed = S.lurkEmptyMin +
    Math.floor(Math.random() * (S.lurkEmptyMax - S.lurkEmptyMin + 1));
  R.nextKick = CFG.dread.kickbackSec;
  R.nextDrop = CFG.dread.dropSec;
}

/* ── 新回合 ─────────────────────────────────────────── */
export function newRound() {
  if (restartTimer !== null) { clearTimeout(restartTimer); restartTimer = null; }
  hooks.resetTransit?.();                      // 過場動過的東西先歸位
  R.lock = new LockState({ ...CFG.lock });
  const falsePin = [...R.lock.falsePins][0];
  R.puzzle = createPinPuzzle(falsePin, R.lock.trueOrder, Math.random);
  beginDoorRound(1, CFG.round.limit, ['eye', 'refl', 'lever']);

  R.lock.on('set', () => beep('set'));
  R.lock.on('falseSet', () => { beep('falseSet'); R.jamStart = performance.now(); });
  R.lock.on('error', d => { beep('error'); flashTrack(d.pin); R.errorCount++; });
  R.lock.on('severe', () => {
    beep('severe'); R.severeCount++; anim.handShake = 0.4;
    R.timer.addPenalty(CFG.penalty.severeJump); // 怪物瞬間前進
  });
  R.lock.on('release', d => {
    if (d.was === 'falseSet' && R.jamStart) { R.jamTime += performance.now() - R.jamStart; R.jamStart = 0; }
  });
  R.lock.on('releaseAll', () => {
    if (R.jamStart) { R.jamTime += performance.now() - R.jamStart; R.jamStart = 0; }
  });
  R.lock.on('solved', () => win());

  decay.applied = 0; decay.floor = 0;
  window.__applySeep(0);
  for (const m of decayGroup.children) m.visible = false;
  decayGroup.userData.farLight.intensity = 1.0;
  decayGroup.userData.farTube.material.color.set(0x93a4bd);
  scene.fog.density = CFG.fog.density;

  buildPins(); renderPins();
  repaint();
  intro.active = true; intro.phase = 'run'; intro.t = 0;
  intro.z = CFG.intro.runFrom; intro.bobPhase = 0; intro.arriveF = 0;
  intro.beeped = intro.th1 = intro.th2 = intro.thTool = false;
  look.yaw = 0; look.target = 0;
  doorLever.rotation.z = 0; door.position.x = 0;
  pickTool.visible = wrench.visible = false;
  pickTool.userData.insert = wrench.userData.insert = 0.12;
  pickTool.position.z = wrench.position.z = 0.12;
  $fade.classList.remove('on');
}

/** 正式開場的結束狀態；自動化與 Debug checkpoint 共用，避免各自竄改 DOM。 */
export function skipIntro() {
  intro.active = false;
  intro.phase = 'tool';
  intro.t = 0; intro.z = 0; intro.bobY = 0; intro.roll = 0; intro.press = 0;
  intro.arriveF = 1;
  intro.beeped = intro.th1 = intro.th2 = intro.thTool = true;
  look.yaw = 0; look.target = 0;
  anim.timeScale = 1;
  doorLever.rotation.z = 0; door.position.x = 0;
  wrench.visible = pickTool.visible = true;
  wrench.position.z = pickTool.position.z = 0;
  R.timer.start();
}

function freezeDoor(won) {
  R.elapsed = R.timer.elapsed;
  R.timer.pause(ROUND_PAUSE);
  R.over = true; R.won = won;
}

/** Freeze a resolved round while its physical exit animation finishes. */
export function freezeRoundForEnding(won) {
  if (R.over) return false;
  freezeDoor(Boolean(won));
  return true;
}

function recordAttempt(msg) {
  if (R.jamStart) { R.jamTime += performance.now() - R.jamStart; R.jamStart = 0; }
  R.attempts.push({
    won: R.won, sec: R.elapsed, look: R.lookTime / 1000,
    jam: R.jamTime / 1000, errors: R.errorCount, msg,
  });
}

/* ── 結束 ───────────────────────────────────────────── */
export function win() {
  if (R.over) return;
  freezeDoor(true);
  beep('solved');
  const clutch = R.elapsed > R.limit;
  const msg = clutch ? '極限逃脫' : '逃脫成功';
  if (hooks.startTransit) {
    // v3 §3：成功不切黑 —— 統計照記，然後直接開門跑向門 2（game/transit.js）
    recordAttempt(msg);
    hooks.startTransit();
  } else endRound(msg);
}

/** 門 2 通電：凍結威脅並記錄，但讓門 2 自己播完電磁閂演出。 */
export function completeDoor() {
  if (R.over) return false;
  freezeDoor(true);
  beep('solved');
  recordAttempt(R.elapsed > R.limit ? '極限通電' : '通電成功');
  return true;
}

export function primaryCause() {
  if (R.door === 2) return door2Cause(
    Boolean(hooks.door2HasPiece?.()), Number(hooks.door2Burnouts?.() ?? 0),
  );
  return primaryCauseOf({
    jamSec: R.jamTime / 1000,
    lookSec: R.lookTime / 1000,
    errorCount: R.errorCount,
    errorSec: CFG.penalty.errorSec,
  });
}

export function die() {
  failRound(primaryCause());
}

/** A scene-specific failure may supply one honest decisive cause. */
export function failRound(msg) {
  if (!freezeRoundForEnding(false)) return false;
  beep('death');
  endRound(msg);
  return true;
}

export function endRound(msg) {
  recordAttempt(msg);
  $fade.querySelector('div').textContent = msg;
  $fade.classList.add('on');
  restartTimer = setTimeout(newRound, 1500);
}
