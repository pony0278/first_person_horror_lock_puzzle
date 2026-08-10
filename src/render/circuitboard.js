/* Door 2 dual-line board renderer.
   Rules live in logic/circuit.ts; this module only owns hit areas and animation. */

import { $pins } from '../dom.js';
export const circuitCanvas = document.createElement('canvas');
circuitCanvas.id = 'circuit';
$pins.appendChild(circuitCanvas);
const ctx = circuitCanvas.getContext('2d');

const C = {
  plate: '#090d12', plate2: '#10171e', edge: '#29333c', seam: '#1d262e',
  track: '#4b5861', trackHi: '#73818a', brass: '#b69a62', brassDim: '#665a42',
  red: '#e55d64', redCore: '#ffd6d5', blue: '#5688e8', blueCore: '#d7e5ff',
  good: '#74c994', bad: '#d26862', scorch: '#6f332f', spark: '#ffe5a8', ghost: '#52616c',
};

const FLOW_STAGE_SEC = 0.22;
const MISSING_CUE_SEC = 1.05;

export const CB = {
  flow: 0, previousStep: 0, sparkT: 0, latch: 0,
  cueT: -1, cueSerial: 0, dropT: -1,
  switchKick: [0, 0, 0, 0],
  onAdvance: null,
};

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

function ensureConnected() {
  if (!circuitCanvas.isConnected) $pins.appendChild(circuitCanvas);
}

export function sizeCircuit() {
  ensureConnected();
  const dpr = Math.min(devicePixelRatio, 2);
  circuitCanvas.width = Math.max(1, Math.round($pins.clientWidth * dpr));
  circuitCanvas.height = Math.max(1, Math.round($pins.clientHeight * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function layout() {
  const w = $pins.clientWidth;
  const h = $pins.clientHeight;
  const sourceW = clamp(w * 0.085, 52, 72);
  const breakerW = clamp(w * 0.09, 56, 76);
  const seqX = sourceW + 5;
  const seqW = Math.max(160, w - sourceW - breakerW - 10);
  const unit = seqW / 8;
  const topY = h * 0.30;
  const bottomY = h * 0.70;
  return {
    w, h, sourceW, breakerW, seqX, seqW, unit, topY, bottomY,
    breakerX: w - breakerW * 0.52,
    breakerY: h * 0.5,
    breakerR: Math.min(27, Math.max(23, h * 0.22)),
  };
}

export function showCircuit() {
  ensureConnected();
  CB.flow = 0; CB.previousStep = 0; CB.sparkT = 0; CB.latch = 0;
  CB.cueT = 0; CB.cueSerial++; CB.dropT = -1;
  CB.switchKick.fill(0);
  sizeCircuit();
}

export function cueMissingFuse() {
  CB.cueT = 0;
  CB.cueSerial++;
}

export function missingFuseCueLevel() {
  if (CB.cueT < 0) return 0;
  return Math.sin(clamp(CB.cueT / MISSING_CUE_SEC) * Math.PI);
}

export function fuseLand() {
  CB.dropT = 0;
  CB.cueT = -1;
}

export function kickSwitch(index) {
  if (index >= 0 && index < 4) CB.switchKick[index] = 1;
}

export function switchAt(clientX, clientY) {
  const rect = circuitCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const x = (clientX - rect.left) * (layout().w / rect.width);
  const y = (clientY - rect.top) * (layout().h / rect.height);
  const L = layout();
  if (y < 0 || y > L.h) return null;
  for (let i = 0; i < 4; i++) {
    const x0 = L.seqX + i * L.unit * 2;
    if (x >= x0 && x < x0 + L.unit) return i;
  }
  return null;
}

export function breakerAt(clientX, clientY) {
  const rect = circuitCanvas.getBoundingClientRect();
  const L = layout();
  const x = (clientX - rect.left) * (L.w / rect.width);
  const y = (clientY - rect.top) * (L.h / rect.height);
  return Math.hypot(x - L.breakerX, y - L.breakerY) <= Math.max(24, L.breakerR * 1.15);
}

export function switchCentreClient(index) {
  const rect = circuitCanvas.getBoundingClientRect();
  const L = layout();
  return {
    x: rect.left + ((L.seqX + (index * 2 + 0.5) * L.unit) / L.w) * rect.width,
    y: rect.top + 0.5 * rect.height,
  };
}

export function breakerCentreClient() {
  const rect = circuitCanvas.getBoundingClientRect();
  const L = layout();
  return {
    x: rect.left + (L.breakerX / L.w) * rect.width,
    y: rect.top + (L.breakerY / L.h) * rect.height,
    r: (L.breakerR / L.w) * rect.width,
  };
}

function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function line(x1, y1, x2, y2, color, width, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.restore();
}

function signalColor(signal) { return signal === 'red' ? C.red : C.blue; }
function signalCore(signal) { return signal === 'red' ? C.redCore : C.blueCore; }

function drawPlate(L, dim) {
  ctx.clearRect(0, 0, L.w, L.h);
  const g = ctx.createLinearGradient(0, 0, 0, L.h);
  g.addColorStop(0, '#101820'); g.addColorStop(1, C.plate);
  ctx.fillStyle = g; ctx.fillRect(0, 0, L.w, L.h);
  ctx.globalAlpha = 0.36 + dim * 0.34;
  ctx.strokeStyle = C.edge; ctx.lineWidth = 1.5;
  ctx.strokeRect(1, 1, L.w - 2, L.h - 2);
  for (const [x, y] of [[7, 7], [L.w - 7, 7], [7, L.h - 7], [L.w - 7, L.h - 7]]) {
    ctx.fillStyle = '#39444d'; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBaseRails(L, dim) {
  const x0 = L.sourceW - 7;
  const x1 = L.seqX + L.seqW;
  for (const y of [L.topY, L.bottomY]) {
    line(x0, y, x1, y, '#28333c', 8, 0.65 * dim);
    line(x0, y, x1, y, C.track, 4, 0.78 * dim);
    line(x0, y - 1, x1, y - 1, C.trackHi, 1, 0.32 * dim);
  }
}

function drawFuse(board, L, dim) {
  const x = 5, y = 7, w = L.sourceW - 11, h = L.h - 14;
  roundRect(x, y, w, h, 6);
  ctx.fillStyle = '#080c10'; ctx.fill();
  ctx.strokeStyle = C.edge; ctx.lineWidth = 1.4; ctx.stroke();

  if (!board.fuseInstalled) {
    const cue = missingFuseCueLevel();
    ctx.save();
    ctx.globalAlpha = Math.max(0.30 * dim, 0.18 + cue * 0.78);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = cue > 0.05 ? '#87c7df' : C.ghost;
    ctx.lineWidth = 1.5 + cue * 2;
    roundRect(x + 7, y + 8, w - 14, h - 16, 5); ctx.stroke();
    ctx.setLineDash([]);
    for (const yy of [L.topY, L.bottomY]) {
      ctx.fillStyle = '#202b33'; ctx.beginPath(); ctx.arc(x + w - 4, yy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#53616b'; ctx.stroke();
    }
    ctx.restore();
    return;
  }

  let drop = 0;
  if (CB.dropT >= 0) {
    const p = clamp(CB.dropT / 0.46);
    drop = -(1 - p) * L.h * 1.2;
  }
  ctx.save(); ctx.translate(0, drop);
  roundRect(x + 6, y + 7, w - 12, h - 14, 5);
  ctx.fillStyle = '#222a30'; ctx.fill();
  ctx.strokeStyle = '#a58e61'; ctx.lineWidth = 1.5; ctx.stroke();
  for (const [yy, color, core] of [
    [L.topY, C.red, C.redCore], [L.bottomY, C.blue, C.blueCore],
  ]) {
    line(x + 10, yy, x + w - 6, yy, '#10161b', 8, dim);
    line(x + 12, yy, x + w - 4, yy, color, 4, 0.78 + dim * 0.22);
    line(x + 15, yy - 0.5, x + w - 7, yy - 0.5, core, 1, 0.7);
  }
  ctx.fillStyle = '#b69a62';
  ctx.fillRect(x + 2, y + 13, 7, h - 26);
  ctx.fillRect(x + w - 9, y + 13, 7, h - 26);
  ctx.restore();
}

function moduleFrame(x, y, w, h, activeColor = null) {
  roundRect(x, y, w, h, 6);
  ctx.fillStyle = C.plate2; ctx.fill();
  ctx.strokeStyle = activeColor ?? C.seam;
  ctx.lineWidth = activeColor ? 1.8 : 1.1;
  ctx.stroke();
}

function drawSwitch(board, index, L, dim) {
  const x = L.seqX + index * L.unit * 2 + 4;
  const y = 6, w = L.unit - 8, h = L.h - 12;
  const kick = CB.switchKick[index];
  moduleFrame(x, y, w, h, kick > 0.15 ? C.brass : null);
  const state = board.switches[index];
  const xa = x + 6, xb = x + w - 6;
  const top = L.topY, bottom = L.bottomY;
  ctx.globalAlpha = 0.45 + dim * 0.45;
  if (state === 0) {
    line(xa, top, xb, top, C.brassDim, 7);
    line(xa, bottom, xb, bottom, C.brassDim, 7);
    line(xa, top, xb, top, C.brass, 2.2);
    line(xa, bottom, xb, bottom, C.brass, 2.2);
  } else {
    line(xa, top, xb, bottom, C.brassDim, 7);
    line(xa, bottom, xb, top, C.brassDim, 7);
    line(xa, top, xb, bottom, C.brass, 2.2);
    line(xa, bottom, xb, top, C.brass, 2.2);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#c1a970'; ctx.beginPath(); ctx.arc(x + w / 2, L.h / 2, 4.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6e6044'; ctx.font = `700 ${Math.max(7, Math.min(9, L.h * 0.065))}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(String.fromCharCode(65 + index), x + w / 2, y + 3);
}

function drawSensor(x, y, signal, active) {
  const color = signalColor(signal);
  const r = 8.5;
  ctx.save();
  if (active) { ctx.shadowColor = color; ctx.shadowBlur = 7; }
  ctx.fillStyle = '#0b1116'; ctx.strokeStyle = color; ctx.lineWidth = active ? 2.2 : 1.4;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawLockGlyph(x, y, open, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.strokeRect(x - 6, y - 1, 12, 9);
  ctx.beginPath();
  ctx.arc(x + (open ? 3 : 0), y - 1, 5, Math.PI, open ? Math.PI * 1.55 : Math.PI * 2);
  ctx.stroke();
}

function drawGate(board, index, L, trace, power, dim, scorched = false) {
  const x = L.seqX + (index * 2 + 1) * L.unit + 4;
  const y = 6, w = L.unit - 8, h = L.h - 12;
  const reached = power === 'testing' && CB.flow >= index + 0.98;
  const passed = (trace?.passed ?? []).includes(index) && (power !== 'testing' || reached);
  const failed = trace?.fault === index && (power !== 'testing' || reached);
  moduleFrame(x, y, w, h, failed ? C.bad : passed ? C.good : scorched ? C.scorch : null);
  ctx.globalAlpha = 0.5 + dim * 0.5;
  line(x + 5, L.topY, x + w - 5, L.topY, C.track, 5);
  line(x + 5, L.bottomY, x + w - 5, L.bottomY, C.track, 5);
  ctx.globalAlpha = 1;
  const gate = board.gates[index];
  drawSensor(x + w / 2, L.topY, gate.top, passed);
  drawSensor(x + w / 2, L.bottomY, gate.bottom, passed);
  if (index === 3) drawLockGlyph(x + w - 12, y + 11, power === 'solved', power === 'solved' ? C.good : C.ghost);
  else {
    ctx.strokeStyle = '#53616a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + w / 2, L.topY + 10); ctx.lineTo(x + w / 2, L.bottomY - 10); ctx.stroke();
  }
  if (scorched) drawScorch(x + w / 2, L.h / 2);
  if (failed && power !== 'off' && power !== 'reboot') drawSpark(x + w / 2, L.h / 2);
}

function drawScorch(x, y) {
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = '#120d0c';
  ctx.beginPath(); ctx.ellipse(x, y, 13, 7, -0.18, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#7a3930'; ctx.lineWidth = 1.3;
  for (const [dx, dy] of [[-15, -7], [14, -6], [-12, 9], [15, 8]]) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
  }
  ctx.restore();
}

function drawBreaker(board, L, power) {
  const active = power === 'testing' || power === 'boot' || power === 'solved';
  const tripped = power === 'trip' || power === 'burnout' || power === 'fatal';
  const ready = board.fuseInstalled && power === 'off';
  const pulse = ready ? 1 + 0.06 * Math.sin(performance.now() / 240) : 1;
  const ring = tripped ? C.bad : active ? '#8de2ef' : ready ? '#7faeb8' : C.ghost;
  ctx.fillStyle = '#0a1015'; ctx.strokeStyle = ring; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(L.breakerX, L.breakerY, L.breakerR * pulse, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = ring; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(L.breakerX, L.breakerY, L.breakerR * 0.45, -Math.PI * 0.22, Math.PI * 1.22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(L.breakerX, L.breakerY - L.breakerR * 0.62); ctx.lineTo(L.breakerX, L.breakerY - 2); ctx.stroke();
}

function drawPartialPolyline(points, fraction, color, core) {
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const n = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    lengths.push(n); total += n;
  }
  let remaining = total * clamp(fraction);
  const drawn = [points[0]];
  for (let i = 1; i < points.length && remaining > 0; i++) {
    const prev = points[i - 1], next = points[i], length = lengths[i - 1];
    if (remaining >= length) { drawn.push(next); remaining -= length; }
    else {
      const p = remaining / length;
      drawn.push({ x: prev.x + (next.x - prev.x) * p, y: prev.y + (next.y - prev.y) * p });
      remaining = 0;
    }
  }
  if (drawn.length < 2) return;
  const stroke = (strokeStyle, width, shadow = 0) => {
    ctx.save(); ctx.strokeStyle = strokeStyle; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (shadow) { ctx.shadowColor = color; ctx.shadowBlur = shadow; }
    ctx.beginPath(); ctx.moveTo(drawn[0].x, drawn[0].y);
    for (let i = 1; i < drawn.length; i++) ctx.lineTo(drawn[i].x, drawn[i].y);
    ctx.stroke(); ctx.restore();
  };
  stroke(color, 4, 8); stroke(core, 1.2);
}

function drawFlow(trace, L) {
  for (const stage of trace.stages) {
    const local = clamp(CB.flow - stage.index);
    if (local <= 0) continue;
    const x0 = L.seqX + stage.index * L.unit * 2 + 6;
    const xSwitch = L.seqX + (stage.index * 2 + 1) * L.unit - 6;
    const x1 = L.seqX + (stage.index * 2 + 2) * L.unit - 6;
    for (const signal of ['red', 'blue']) {
      const beforeRail = signal === 'red' ? stage.before : 1 - stage.before;
      const afterRail = signal === 'red' ? stage.after : 1 - stage.after;
      const y0 = beforeRail === 0 ? L.topY : L.bottomY;
      const y1 = afterRail === 0 ? L.topY : L.bottomY;
      drawPartialPolyline(
        [{ x: x0, y: y0 }, { x: xSwitch, y: y1 }, { x: x1, y: y1 }],
        local, signalColor(signal), signalCore(signal),
      );
    }
  }
}

function drawSpark(x, y) {
  const phase = performance.now() * 0.018;
  ctx.save(); ctx.strokeStyle = C.spark; ctx.lineWidth = 1.7;
  for (let i = 0; i < 6; i++) {
    const a = phase + i * Math.PI / 3;
    const r = 9 + 3 * Math.sin(phase * 1.7 + i);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.stroke();
  }
  ctx.fillStyle = '#ffd779'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawCircuit(board, dt, dimF = 1, power = 'off', lastTrace = null, scorchedGate = null) {
  const L = layout();
  const dpr = Math.min(devicePixelRatio, 2);
  if (circuitCanvas.width !== Math.round(L.w * dpr) || circuitCanvas.height !== Math.round(L.h * dpr)) sizeCircuit();
  const dim = clamp(0.18 + dimF * 0.82);
  const trace = lastTrace ?? { outcome: board.fuseInstalled ? 'fault' : 'missing', fault: null, passed: [], stages: [] };

  if (power === 'testing') {
    const maxFlow = trace.stages.length;
    CB.flow = Math.min(maxFlow, CB.flow + dt / FLOW_STAGE_SEC);
    const step = Math.floor(CB.flow + 0.001);
    if (step > CB.previousStep) CB.onAdvance?.(step, step / 4);
    CB.previousStep = step;
  } else if (power === 'solved') {
    CB.flow = 4;
    CB.latch = Math.min(1, CB.latch + dt / 0.45);
  } else if (power !== 'trip') {
    CB.flow = Math.max(0, CB.flow - dt / 0.07);
    CB.previousStep = 0;
  }
  CB.sparkT += dt;
  for (let i = 0; i < CB.switchKick.length; i++) CB.switchKick[i] = Math.max(0, CB.switchKick[i] - dt * 4.5);

  drawPlate(L, dim);
  drawBaseRails(L, dim);
  drawFuse(board, L, dim);
  for (let i = 0; i < 4; i++) {
    drawSwitch(board, i, L, dim);
    drawGate(board, i, L, trace, power, dim, scorchedGate === i);
  }
  if (power === 'testing' || power === 'solved') drawFlow(trace, L);
  drawBreaker(board, L, power);

  if (CB.dropT >= 0) {
    CB.dropT += dt;
    if (CB.dropT > 0.62) CB.dropT = -1;
  }
  if (CB.cueT >= 0) {
    CB.cueT += dt;
    if (CB.cueT >= MISSING_CUE_SEC) CB.cueT = -1;
  }
}

export { FLOW_STAGE_SEC };
