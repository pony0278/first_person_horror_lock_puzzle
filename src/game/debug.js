/* Phase D0.1 — Developer Debug & Transition Lab.
 *
 * Enabled only by ?debug=1. Every checkpoint is built by running legal game
 * state and the real transition machines; the lab never teleports only the
 * camera or edits rendered DOM as a substitute for gameplay state.
 */

import { CFG } from '../logic/config.js';
import {
  DEBUG_SEQUENCES, debugQuery, debugStages, parseDebugOptions,
} from '../logic/debug.js';
import { seededCircuit } from '../logic/circuit.js';
import { $debugLab } from '../dom.js';
import { R, ST, anim, hooks, look } from '../state.js';
import { D2, setDoor2Answer, testDoor2, updateDoor2 } from './door2-circuit.js';
import {
  D3, door3PumpSnapshot, replayDoor3DebugEffects, resetDoor3DebugEffects,
  seekDoor3DebugEffects, updateDoor3,
} from './door3.js';
import { newRound, skipIntro } from './round.js';
import { T, tug, updateTransit } from './transit.js';

const DEBUG_THREAT = 'debug-threat';
const DEBUG_PLAYBACK = 'debug-playback';
const STEP = 1 / 60;

const SEQUENCE_LABELS = {
  full: '完整流程',
  door1: 'Door 1 門前',
  'door1-door2': 'Door 1 → Door 2 過場',
  door2: 'Door 2 檢查點',
  'door2-door3': 'Door 2 → Door 3 過場',
  door3: 'Door 3 泵房',
};

const STAGE_LABELS = {
  start: '正常開局', lock: '鎖前（略過開場）',
  unlock: '解鎖瞬間', through: '連續穿門', corner: '轉角停電',
  approach: '跑向下一門', arrive: '下一門前減速', door2: 'Door 2 初始化',
  missing: '尚未取得保險絲', 'first-fuse': '第一根已插入',
  burnout: '熔斷後／第二次回頭', 'final-fuse': '最後機會',
  success: '正解提交瞬間', unlocked: '電磁鎖解開', open: 'Door 2 開門',
  walk: '直線接近十字中心', cross: '十字中心／停留觀察',
  console: '走向工作檯正面', explore: '工作檯正面操作位',
};

const el = id => document.getElementById(id);
const $sequence = el('dbgSequence');
const $stage = el('dbgStage');
const $seed = el('dbgSeed');
const $play = el('dbgPlay');
const $loop = el('dbgLoop');
const $threat = el('dbgThreat');
const $station = el('dbgStation');
const $status = el('dbgStatus');
const $link = el('dbgLink');
const $headerState = el('dbgHeaderState');
const $door3Time = el('dbgDoor3Time');

export const DBG = {
  enabled: false,
  sequence: 'door1-door2',
  stage: 'unlock',
  speed: 1,
  loop: false,
  seed: 1842,
  paused: false,
  threatFrozen: true,
  completeT: 0,
  preparing: false,
  notice: '',
  lastSync: 0,
};

export const debugThreatFrozen = () => DBG.enabled && DBG.threatFrozen;

function stepUntil(label, predicate, advance, maxSteps = 4800) {
  if (predicate()) return;
  for (let i = 0; i < maxSteps; i++) {
    advance(STEP);
    if (predicate()) return;
  }
  throw new Error(`Debug checkpoint did not reach ${label}`);
}

function startDoor1Door2() {
  newRound();
  R.lock.getHint().order.forEach(index => R.lock.push(index));
  if (!T.active || T.phase !== 'open') throw new Error('Door 1 success did not start transit');
}

function seekDoor1Door2(stage) {
  startDoor1Door2();
  if (stage === 'unlock') return;
  stepUntil(`Door 1 → Door 2 / ${stage}`,
    () => T.phase === stage && (stage !== 'door2' || D2.active),
    dt => updateTransit(dt));
}

function prepareDoor2Missing() {
  seekDoor1Door2('door2');
  if (!D2.active || !D2.board || T.phase !== 'door2') {
    throw new Error('Door 2 missing-fuse state is incomplete');
  }
}

function retrieveDoor2Fuse(expectedNumber) {
  if (T.phase !== 'door2' || !tug(true)) throw new Error('Door 2 fuse pickup could not start');
  stepUntil(`Door 2 fuse ${expectedNumber} insertion`,
    () => T.phase === 'door2' && D2.fuseNumber === expectedNumber,
    dt => updateTransit(dt));
  stepUntil(`Door 2 fuse ${expectedNumber} ready`,
    () => D2.power === 'off', dt => updateDoor2(dt, 1));
}

function prepareDoor2(stage) {
  prepareDoor2Missing();
  if (stage === 'missing') return;

  retrieveDoor2Fuse(1);
  if (stage === 'first-fuse') return;

  setDoor2Answer(false);
  if (!testDoor2()) throw new Error('Door 2 burnout diagnostic could not start');
  stepUntil('Door 2 first fuse burnout',
    () => D2.awaitingFuse && D2.power === 'off', dt => updateDoor2(dt, 1));
  if (stage === 'burnout') return;

  retrieveDoor2Fuse(2);
}

function prepareDoor2Door3(stage) {
  prepareDoor2('first-fuse');
  if (!setDoor2Answer(true) || !testDoor2()) {
    throw new Error('Door 2 solved diagnostic could not start');
  }
  if (stage === 'success') return;

  stepUntil('Door 2 unlocked', () => D2.power === 'solved', dt => updateDoor2(dt, 1));
  if (stage === 'unlocked') return;

  stepUntil('Door 2 → Door 3 open', () => D3.active && D3.phase === 'open',
    dt => updateDoor2(dt, 1));
  if (stage === 'open') return;

  stepUntil(`Door 2 → Door 3 / ${stage}`, () => D3.phase === stage,
    dt => updateDoor3(dt));
}

function applyThreatFreeze() {
  if (!DBG.enabled) return;
  if (DBG.threatFrozen) R.timer.pause(DEBUG_THREAT);
  else R.timer.resume(DEBUG_THREAT);
  if ($threat) $threat.checked = DBG.threatFrozen;
}

function applyPlayback() {
  if (!DBG.enabled) return;
  R.timer.setRate(DBG.speed);
  anim.debugScale = DBG.paused ? 0 : DBG.speed;
  if (DBG.paused) R.timer.pause(DEBUG_PLAYBACK);
  else R.timer.resume(DEBUG_PLAYBACK);
}

function updateUrl() {
  const query = debugQuery({
    enabled: true, sequence: DBG.sequence, stage: DBG.stage,
    speed: DBG.speed, loop: DBG.loop, seed: DBG.seed,
  });
  history.replaceState(null, '', `${location.pathname}?${query}${location.hash}`);
  if ($link) $link.textContent = `${location.pathname}?${query}`;
}

function setNotice(message) {
  DBG.notice = message;
  syncPanel(true);
}

function loadScenario() {
  if (!DBG.enabled || DBG.preparing) return false;
  DBG.preparing = true;
  DBG.completeT = 0;
  DBG.notice = '';
  hooks.makeDoor2Board = () => seededCircuit(DBG.seed);

  try {
    if (DBG.sequence === 'full') newRound();
    else if (DBG.sequence === 'door1') { newRound(); skipIntro(); }
    else if (DBG.sequence === 'door1-door2') seekDoor1Door2(DBG.stage);
    else if (DBG.sequence === 'door2') prepareDoor2(DBG.stage);
    else if (DBG.sequence === 'door2-door3') prepareDoor2Door3(DBG.stage);
    else if (DBG.sequence === 'door3') prepareDoor2Door3('explore');

    applyThreatFreeze();
    applyPlayback();
    updateUrl();
    syncPanel(true);
    return true;
  } catch (error) {
    console.error(error);
    DBG.notice = String(error?.message ?? error);
    syncPanel(true);
    return false;
  } finally {
    DBG.preparing = false;
  }
}

function readForm() {
  const params = new URLSearchParams();
  params.set('debug', '1');
  params.set('sequence', $sequence.value);
  params.set('stage', $stage.value);
  params.set('speed', String(DBG.speed));
  params.set('loop', DBG.loop ? '1' : '0');
  params.set('seed', $seed.value);
  Object.assign(DBG, parseDebugOptions(params));
}

function populateStages(preferred) {
  const stages = debugStages($sequence.value);
  $stage.replaceChildren(...stages.map(stage => {
    const option = document.createElement('option');
    option.value = stage;
    option.textContent = STAGE_LABELS[stage] ?? stage;
    return option;
  }));
  $stage.value = stages.includes(preferred) ? preferred : stages[0];
}

function setMonsterStation(value) {
  const index = Math.max(0, Math.min(CFG.stations.z.length - 1, Number(value) || 0));
  ST.index = index;
  ST.z = ST.targetZ = CFG.stations.z[index];
  ST.moveT = 0; ST.pendingJump = false; ST.stareT = 0; ST.blink = 0; ST.seen = false;
  ST.phase = 'off'; ST.emptyGot = 0; ST.glanceT = 0; ST.counted = false;
  ST.faceT = 0; ST.readyOff = false; ST.armedT = 0;
  setNotice(`怪物站位設為 ${index}`);
}

function jumpTo(sequence, stage) {
  $sequence.value = sequence;
  populateStages(stage);
  $stage.value = stage;
  readForm();
  return loadScenario();
}

function ensureDoor2(stage) {
  if (D2.active && D2.board) return true;
  return jumpTo('door2', stage);
}

function triggerBurnout() {
  if (!ensureDoor2('first-fuse') || D2.fuseNumber !== 1 || D2.power !== 'off') {
    if (!jumpTo('door2', 'first-fuse')) return false;
  }
  setDoor2Answer(false);
  const started = testDoor2();
  setNotice(started ? '正在播放第一次熔斷' : '目前狀態不能熔斷');
  return started;
}

function retrieveSpare() {
  if (!D2.awaitingFuse && !jumpTo('door2', 'burnout')) return false;
  const started = T.phase === 'door2' && tug(true);
  setNotice(started ? '正在播放備用保險絲取件' : '目前沒有可取得的備用件');
  return started;
}

function triggerFatal() {
  if (!D2.active || D2.fuseNumber !== 2 || D2.power !== 'off') {
    if (!jumpTo('door2', 'final-fuse')) return false;
  }
  setDoor2Answer(false);
  const started = testDoor2();
  setNotice(started ? '正在播放第二次失敗' : '目前狀態不能提交');
  return started;
}

function ensureDoor3Operator() {
  if (D3.active && D3.phase === 'explore') return true;
  return jumpTo('door3', 'explore');
}

function pauseDoor3Frame() {
  DBG.paused = true;
  applyPlayback();
}

function replayDoor3Fx(wetOnly = false) {
  if (!ensureDoor3Operator()) return false;
  DBG.paused = false;
  applyPlayback();
  const started = replayDoor3DebugEffects({ wetOnly });
  setNotice(started
    ? wetOnly ? 'Door 3 濕視野單獨播放中' : 'Door 3 爆管與濕視野重播中'
    : 'Door 3 操作位尚未就緒');
  return started;
}

function resetDoor3Fx() {
  if (!ensureDoor3Operator()) return false;
  const reset = resetDoor3DebugEffects();
  setNotice(reset ? 'Door 3 特效已重置；下一次合法轉移仍可觸發' : 'Door 3 操作位尚未就緒');
  return reset;
}

function seekDoor3Fx(value) {
  if (!ensureDoor3Operator()) return false;
  const time = Math.max(0, Math.min(4, Number(value) || 0));
  $door3Time.value = time.toFixed(2);
  pauseDoor3Frame();
  const snapshot = seekDoor3DebugEffects(time);
  setNotice(snapshot
    ? `Door 3 FX 已定格 ${time.toFixed(2)}s（${snapshot.effects.phase}）`
    : 'Door 3 操作位尚未就緒');
  return Boolean(snapshot);
}

function lookDoor3(yaw) {
  if (!ensureDoor3Operator()) return false;
  look.yaw = yaw;
  look.target = yaw;
  setNotice(yaw === 0 ? '視角返回工作檯' : '視角轉向後方破管');
  return true;
}

function transitionComplete() {
  if (DBG.sequence === 'door1-door2') return D2.active && T.phase === 'door2';
  if (DBG.sequence === 'door2-door3') return D3.active && D3.phase === 'explore';
  return false;
}

function syncPanel(force = false) {
  if (!DBG.enabled) return;
  const now = performance.now();
  if (!force && now - DBG.lastSync < 100) return;
  DBG.lastSync = now;

  const elapsed = R.timer.elapsed;
  const remaining = Math.max(0, R.limit - elapsed);
  const board = D2.board;
  const phase = D3.active ? `D3:${D3.phase}` : D2.active ? `D2:${D2.power}` : `T:${T.phase}`;
  $headerState.textContent = phase;
  $play.textContent = DBG.paused ? '▶' : '⏸';
  $play.classList.toggle('on', DBG.paused);
  $loop.textContent = `循環：${DBG.loop ? '開' : '關'}`;
  $loop.classList.toggle('on', DBG.loop);
  document.querySelectorAll('.dbgSpeed').forEach(button => {
    button.classList.toggle('on', Number(button.dataset.speed) === DBG.speed);
  });
  if (document.activeElement !== $station) $station.value = String(ST.index);

  const answer = board ? board.solution.join(' ') : '—';
  const pauses = R.timer.pauseReasons.join(', ') || 'none';
  const perf = D3.active ? hooks.door3Performance?.() : null;
  const door3Fx = D3.active ? door3PumpSnapshot() : null;
  const perfText = perf
    ? `\nD3 calls ${perf.drawCalls}/${perf.budget.maxDrawCalls} · lights ${perf.pointLights}` +
      ` · transmission ${perf.transmissionMaterials} · pixels ${perf.bufferPixels}` +
      `\nframe avg ${perf.frameTime.averageMs.toFixed(1)}ms · p95 ${perf.frameTime.p95Ms.toFixed(1)}ms` +
      ` · worst ${perf.frameTime.worstMs.toFixed(1)}ms · slow ${perf.frameTime.slowFrames}/${perf.frameTime.samples}`
    : '';
  const fxText = door3Fx
    ? `\nFX ${door3Fx.effects.phase} @ ${door3Fx.effects.burstT.toFixed(2)}s` +
      ` · pressure ${door3Fx.effects.streamPressure.toFixed(2)}` +
      ` · wet ${door3Fx.wetGlass.amount.toFixed(2)} @ ${door3Fx.wetGlass.time.toFixed(2)}s`
    : '';
  $status.textContent =
    `door ${R.door} · ${phase}\n` +
    `clock ${elapsed.toFixed(2)} / ${R.limit}s · remain ${remaining.toFixed(2)}s · ${R.timer.rate}×\n` +
    `paused ${pauses}\n` +
    `monster station ${ST.index} · threat ${DBG.threatFrozen ? 'frozen' : 'live'}\n` +
    `board ${board?.id ?? '—'} · fuse ${D2.fuseNumber || '—'} · answer ${answer}` + perfText + fxText +
    (DBG.notice ? `\n${DBG.notice}` : '');
}

function bindUi() {
  $sequence.replaceChildren(...Object.keys(DEBUG_SEQUENCES).map(sequence => {
    const option = document.createElement('option');
    option.value = sequence;
    option.textContent = SEQUENCE_LABELS[sequence] ?? sequence;
    return option;
  }));
  $sequence.value = DBG.sequence;
  populateStages(DBG.stage);
  $stage.value = DBG.stage;
  $seed.value = String(DBG.seed);
  $threat.checked = DBG.threatFrozen;

  el('dbgToggle').addEventListener('click', () => {
    $debugLab.classList.toggle('collapsed');
    el('dbgToggle').textContent = $debugLab.classList.contains('collapsed') ? '+' : '−';
  });
  $sequence.addEventListener('change', () => populateStages(null));
  el('dbgLoad').addEventListener('click', () => { readForm(); loadScenario(); });
  el('dbgReplay').addEventListener('click', () => { readForm(); loadScenario(); });
  $play.addEventListener('click', () => { DBG.paused = !DBG.paused; applyPlayback(); syncPanel(true); });
  $loop.addEventListener('click', () => { DBG.loop = !DBG.loop; DBG.completeT = 0; updateUrl(); syncPanel(true); });
  document.querySelectorAll('.dbgSpeed').forEach(button => button.addEventListener('click', () => {
    DBG.speed = Number(button.dataset.speed);
    applyPlayback(); updateUrl(); syncPanel(true);
  }));
  $threat.addEventListener('change', () => {
    DBG.threatFrozen = $threat.checked;
    applyThreatFreeze(); syncPanel(true);
  });
  $station.addEventListener('change', () => setMonsterStation($station.value));
  el('dbgAdd10').addEventListener('click', () => { R.timer.addPenalty(10); syncPanel(true); });
  el('dbgLast3').addEventListener('click', () => { R.timer.setElapsed(Math.max(0, R.limit - 3)); syncPanel(true); });
  el('dbgAnswer').addEventListener('click', () => setNotice(setDoor2Answer(true) ? '已套用正解，尚未提交' : 'Door 2 尚未就緒'));
  el('dbgWrong').addEventListener('click', () => setNotice(setDoor2Answer(false) ? '已保證為錯誤答案，尚未提交' : 'Door 2 尚未就緒'));
  el('dbgBurnout').addEventListener('click', triggerBurnout);
  el('dbgSpare').addEventListener('click', retrieveSpare);
  el('dbgFatal').addEventListener('click', triggerFatal);
  el('dbgDoor3Operator').addEventListener('click', () => {
    const loaded = jumpTo('door3', 'explore');
    setNotice(loaded ? '已進入 Door 3 工作檯正面操作位' : 'Door 3 操作位載入失敗');
  });
  el('dbgDoor3Replay').addEventListener('click', () => replayDoor3Fx(false));
  el('dbgDoor3Wet').addEventListener('click', () => replayDoor3Fx(true));
  el('dbgDoor3Reset').addEventListener('click', resetDoor3Fx);
  document.querySelectorAll('.dbgDoor3Phase').forEach(button =>
    button.addEventListener('click', () => seekDoor3Fx(button.dataset.time)));
  el('dbgDoor3Seek').addEventListener('click', () => seekDoor3Fx($door3Time.value));
  el('dbgDoor3Rear').addEventListener('click', () => lookDoor3(180));
  el('dbgDoor3Front').addEventListener('click', () => lookDoor3(0));
  el('dbgDoor3Resume').addEventListener('click', () => {
    if (!ensureDoor3Operator()) return;
    DBG.paused = false;
    applyPlayback();
    setNotice('Door 3 FX 從定格處繼續播放');
  });
  el('dbgCopy').addEventListener('click', async () => {
    updateUrl();
    try {
      await navigator.clipboard.writeText(location.href);
      setNotice('測試網址已複製');
    } catch {
      setNotice('瀏覽器未允許剪貼簿；網址已顯示在上方');
    }
  });
  addEventListener('keydown', event => {
    if (event.code === 'Backquote') el('dbgToggle').click();
  });
}

export function initDebug() {
  const options = parseDebugOptions(location.search);
  if (!options.enabled) return false;

  Object.assign(DBG, options, { enabled: true, paused: false, threatFrozen: true });
  document.body.classList.add('debug-mode');
  $debugLab.hidden = false;
  bindUi();
  R.timer.pause(DEBUG_THREAT);
  loadScenario();

  window.__debugLab = () => ({
    enabled: DBG.enabled, sequence: DBG.sequence, stage: DBG.stage,
    speed: DBG.speed, loop: DBG.loop, paused: DBG.paused,
    threatFrozen: DBG.threatFrozen, seed: DBG.seed,
    timerRate: R.timer.rate,
    phase: D3.active ? D3.phase : D2.active ? D2.power : T.phase,
  });
  window.__debugLoad = (sequence, stage) => jumpTo(sequence, stage);
  window.__debugDoor3Fx = (action, value) => {
    if (action === 'operator') return jumpTo('door3', 'explore');
    if (action === 'replay') return replayDoor3Fx(false);
    if (action === 'wet') return replayDoor3Fx(true);
    if (action === 'reset') return resetDoor3Fx();
    if (action === 'seek') return seekDoor3Fx(value);
    if (action === 'rear') return lookDoor3(180);
    if (action === 'front') return lookDoor3(0);
    return false;
  };
  return true;
}

export function updateDebug(dt) {
  if (!DBG.enabled || DBG.preparing) return;
  if (DBG.loop && !DBG.paused && transitionComplete()) {
    DBG.completeT += dt;
    if (DBG.completeT >= 1.1) loadScenario();
  } else DBG.completeT = 0;
  syncPanel();
}
