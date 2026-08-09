/* 門 2 下方盤面：通電管線。
   與剖面圖同一種語言：風格化色塊＋輪廓線，不模擬材質。
   電流是這個面板唯一承載資訊的東西 —— 其餘都是它的註腳（同 cutaway 的剪切線原則）。

   這一層只畫，不決定：盤面資料與規則在 logic/pipe.ts，
   點擊、音效與流程在 game/door2.js。渲染層唯一的狀態是「演出進度」
   （電流掃到哪、格子轉到幾度、零件落下多久），全部放在 PB。 */

import { chain, maskOf, traceRoute } from '../logic/pipe.js';
import { $pins } from '../dom.js';

export const pipeCanvas = document.createElement('canvas');
pipeCanvas.id = 'pipe';
$pins.appendChild(pipeCanvas);
const ctx = pipeCanvas.getContext('2d');

/* 調色盤：金屬沿用剖面圖的灰階，電流用變電室火花燈的 0x9fd8ff 一族 ——
   下方的電流和身後的火花是同一種東西，顏色得說同一句話（§8）。 */
const C = {
  plate: '#16181c', plateEdge: '#0c0d10',
  pipe: '#5c6169', pipeHi: '#767d86', pipeLo: '#3a3e45',
  live: '#9fd8ff', liveCore: '#e6f4ff', liveHalo: '#2e5a75',
  burnt: '#141519', crack: '#000000', burntEdge: '#26292e',
  ghost: '#4a7a96', latch: '#a5675f', line: '#0a0b0d',
};

/** 演出狀態。lit 是電流掃描的浮點前緣（0~鏈長），每格約 35ms —— 是電，不是進度條。 */
export const PB = {
  lit: 0, prevLen: 0,
  sparkT: 0,                 // 前緣電弧的節拍器（0.6s 一閃）
  cueT: -1, cueSerial: 0,    // 缺件診斷脈衝；上桌與點空槽時重播
  ang: [], target: [],       // 每格的顯示角度與目標角度（度）—— 轉起來才像動手
  dropT: -1, dropCell: -1,   // 取回的零件落槽動畫
  latchT: 0,                 // 電磁閂退開
  /** 前緣每前進一格呼叫（litN, reach01）。音效由 game 層掛進來，渲染層不出聲。 */
  onAdvance: null,
};

const MISSING_CUE_SEC = 1.15;

/** 重播缺件診斷脈衝；只強調空槽與所缺管型，不洩漏正確路徑。 */
export function cueMissingPiece() {
  PB.cueT = 0;
  PB.cueSerial++;
}

/** 目前缺件脈衝強度（0~1），供盤面與身後缺口燈共用同一拍。 */
export function missingCueLevel() {
  if (PB.cueT < 0) return 0;
  const life = Math.max(0, 1 - PB.cueT / MISSING_CUE_SEC);
  return life * (0.68 + 0.32 * Math.cos(PB.cueT * 18) ** 2);
}
export function sizePipe() {
  const dpr = Math.min(devicePixelRatio, 2);
  pipeCanvas.width = $pins.clientWidth * dpr;
  pipeCanvas.height = $pins.clientHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** 開一面盤：初始化演出狀態。
    buildPins() 每局以 innerHTML='' 重建 #pins —— pipe canvas 會被抹出 DOM，
    detached canvas 照畫不誤但看不見也點不到，所以每次上桌先掛回去。 */
export function showPipe(board) {
  if (!pipeCanvas.isConnected) $pins.appendChild(pipeCanvas);
  sizePipe();
  PB.lit = 0; PB.prevLen = 0; PB.sparkT = 0;
  PB.dropT = -1; PB.dropCell = -1; PB.latchT = 0;
  cueMissingPiece();
  PB.ang = board.cells.map(c => c.rot * 90);
  PB.target = [...PB.ang];
}

/** 玩家轉了第 i 格：顯示角度往前 +90°（永遠順時針，跟 rotMask 一致）。 */
export function spinCell(i, cell) {
  PB.target[i] = cell?.kind === 'diverter' ? cell.rot * 90 : (PB.target[i] ?? 0) + 90;
}

/** 零件落進第 i 格：從畫面上方掉下來，落定角度就是它的 rot（歪的）。 */
export function pieceLand(i, rot) {
  PB.dropT = 0; PB.dropCell = i;
  PB.ang[i] = PB.target[i] = rot * 90;
}

/* ── 佈局：左右各留端子區，格子取最大正方形，置中 ── */
function layout() {
  const w = $pins.clientWidth, h = $pins.clientHeight;
  const term = Math.max(26, Math.min(56, w * 0.07));
  const cell = Math.min((w - term * 2) / 8, h / 2);
  const gx = (w - cell * 8) / 2, gy = (h - cell * 2) / 2;
  return { w, h, term, cell, gx, gy,
    testX: gx - term * 0.62, testY: gy + cell * 0.5, testR: Math.max(24, Math.min(29, cell * 0.48)) };
}
/** 點到哪一格（client 座標）。不在格子上回 null。 */
export function cellAt(clientX, clientY) {
  const r = pipeCanvas.getBoundingClientRect();
  const { cell, gx, gy } = layout();
  const c = Math.floor((clientX - r.left - gx) / cell);
  const row = Math.floor((clientY - r.top - gy) / cell);
  if (c < 0 || c > 7 || row < 0 || row > 1) return null;
  return row * 8 + c;
}

/** 左側主斷路器是否被點中。它有獨立 ≥48px 的觸控目標，不佔管格。 */
export function testAt(clientX, clientY) {
  const r = pipeCanvas.getBoundingClientRect();
  const { testX, testY, testR } = layout();
  return Math.hypot(clientX - r.left - testX, clientY - r.top - testY) <= testR;
}

/** 主斷路器中心（端到端測試使用）。 */
export function testCentreClient() {
  const r = pipeCanvas.getBoundingClientRect();
  const { testX, testY, testR } = layout();
  return { x: r.left + testX, y: r.top + testY, r: testR };
}
/** 第 i 格中心的 client 座標（測試接點用）。 */
export function cellCentreClient(i) {
  const r = pipeCanvas.getBoundingClientRect();
  const { cell, gx, gy } = layout();
  return { x: r.left + gx + (i % 8 + 0.5) * cell, y: r.top + gy + (Math.floor(i / 8) + 0.5) * cell };
}

/* 每格的基準形狀（rot=0）：直管＝橫桿（E|W），彎管＝上右四分之一（N|E）。
   其餘轉向交給 ctx.rotate —— 畫布的正角就是順時針，與 rotMask 同向。 */
function pipePath(kind, s) {
  ctx.beginPath();
  if (kind === 'straight') { ctx.moveTo(-s / 2, 0); ctx.lineTo(s / 2, 0); }
  else { ctx.moveTo(0, -s / 2); ctx.lineTo(0, 0); ctx.lineTo(s / 2, 0); }
}

function strokePipe(kind, s, w1, color) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  ctx.strokeStyle = color; ctx.lineWidth = w1;
  pipePath(kind, s); ctx.stroke();
}

/** 依世界方向遮罩畫中心到各端口；分流器不旋轉整塊，而是刀閘在三口之間切換。 */
function strokeMask(mask, s, width, color) {
  ctx.beginPath();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  if (mask & 1) { ctx.moveTo(0, 0); ctx.lineTo(0, -s / 2); }
  if (mask & 2) { ctx.moveTo(0, 0); ctx.lineTo(s / 2, 0); }
  if (mask & 4) { ctx.moveTo(0, 0); ctx.lineTo(0, s / 2); }
  if (mask & 8) { ctx.moveTo(0, 0); ctx.lineTo(-s / 2, 0); }
  ctx.stroke();
}
/* 燒毀格的裂紋：用格號當種子的固定折線，每幀畫一樣的（不閃爍才像焦死的東西） */
function cracks(i, s) {
  let a = (i * 2654435761) >>> 0;
  const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
  ctx.strokeStyle = C.crack; ctx.lineWidth = 1.2;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    let x = (rnd() - 0.5) * s * 0.8, y = -s * 0.38;
    ctx.moveTo(x, y);
    for (let seg = 0; seg < 3; seg++) {
      x += (rnd() - 0.5) * s * 0.35; y += s * 0.25;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/**
 * 每幀重畫。dimF 是走廊燈的即時亮度（含燈閃）——
 * 沒通電的部分跟著環境一起暗，**已通電的部分不暗**：
 * 黑掉的那 0.18 秒，畫面上唯一亮著的就是你自己救回來的電（v3 §7）。
 */
export function drawPipe(board, dt, dimF = 1, power = 'off') {
  const { w, h, term, cell, gx, gy, testX, testY, testR } = layout();
  const dpr = Math.min(devicePixelRatio, 2);
  if (pipeCanvas.width !== Math.round(w * dpr) ||
      pipeCanvas.height !== Math.round(h * dpr)) sizePipe();   // chrome 收合只改高度

  const trace = traceRoute(board);
  const ch = chain(board);
  const powered = power === 'testing' || power === 'solved';
  const solved = power === 'solved';
  const target = powered ? ch.length : 0;
  // 只有按下主斷路器後電流才掃描；配置階段保持斷電，不再逐格洩漏答案。
  if (PB.lit < target) PB.lit = Math.min(target, PB.lit + dt / 0.035);
  else if (PB.lit > target) PB.lit = Math.max(target, PB.lit - dt / 0.015);
  const litN = Math.floor(Math.min(PB.lit, target));
  if (litN > PB.prevLen) PB.onAdvance?.(litN, litN / board.cells.length);
  PB.prevLen = litN;
  const litSet = new Set(ch.slice(0, litN));

  PB.sparkT += dt;
  const sparkOn = powered && (PB.sparkT % 0.6) < 0.12 && !solved && litN > 0;
  if (solved) PB.latchT = Math.min(1, PB.latchT + dt / 0.5);

  const unlit = Math.max(0.18, Math.min(1, 0.12 + 0.88 * dimF));   // 燈閃時沉到近黑

  ctx.clearRect(0, 0, w, h);

  // ── 底板 ──
  ctx.globalAlpha = unlit;
  ctx.fillStyle = C.plate;
  ctx.fillRect(gx - term, gy - cell * 0.12, cell * 8 + term * 2, cell * 2.24);
  ctx.strokeStyle = C.plateEdge; ctx.lineWidth = 2;
  ctx.strokeRect(gx - term, gy - cell * 0.12, cell * 8 + term * 2, cell * 2.24);
  ctx.globalAlpha = 1;

  // ── 主斷路器＋電源端子：配置時斷電，按下後才讓電流沿整條路跑一次 ──
  {
    const y = gy + cell * 0.5;
    const ready = !board.cells.some(c => c.kind === 'empty');
    const active = power === 'testing' || power === 'solved';
    const tripped = power === 'trip';
    const ring = active ? C.live : tripped ? C.latch : ready ? '#b69a62' : C.pipeLo;

    ctx.globalAlpha = Math.max(unlit, active ? 0.92 : 0.62);
    ctx.strokeStyle = active ? C.liveHalo : C.pipeLo; ctx.lineWidth = cell * 0.34;
    ctx.beginPath(); ctx.moveTo(testX + testR * 0.72, y); ctx.lineTo(gx, y); ctx.stroke();
    ctx.strokeStyle = active ? C.live : C.pipe; ctx.lineWidth = cell * 0.16;
    ctx.beginPath(); ctx.moveTo(testX + testR * 0.72, y); ctx.lineTo(gx, y); ctx.stroke();

    const pulse = ready && power === 'off' ? 1 + 0.08 * Math.sin(performance.now() / 260) : 1;
    ctx.fillStyle = C.plateEdge; ctx.strokeStyle = ring; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(testX, testY, testR * pulse, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = ring; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(testX, testY, testR * 0.48, -Math.PI * 0.27, Math.PI * 1.27); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(testX, testY - testR * 0.63); ctx.lineTo(testX, testY - testR * 0.08); ctx.stroke();
    ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
  }
  // ── 格子 ──
  const pw = cell * 0.30;
  for (let i = 0; i < board.cells.length; i++) {
    const c = board.cells[i];
    const cx = gx + (i % 8 + 0.5) * cell;
    let cy = gy + (Math.floor(i / 8) + 0.5) * cell;
    const lit = litSet.has(i);

    // 落槽動畫：從上方掉進來，落定時輕微回彈
    if (i === PB.dropCell && PB.dropT >= 0) {
      const p = Math.min(1, PB.dropT / 0.45);
      const e = 1 - Math.pow(1 - p, 3);
      cy -= (1 - e) * cell * 1.6;
      if (p >= 1 && PB.dropT > 0.6) { PB.dropCell = -1; }
    }

    // 格框（暗色，只給眼睛數格子用）
    ctx.globalAlpha = unlit * 0.5;
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.strokeRect(cx - cell / 2 + 1, cy - cell / 2 + 1, cell - 2, cell - 2);
    ctx.globalAlpha = 1;

    if (c.kind === 'burnt') {
      ctx.globalAlpha = unlit;
      ctx.save(); ctx.translate(cx, cy);
      ctx.fillStyle = C.burnt;
      ctx.fillRect(-cell * 0.42, -cell * 0.42, cell * 0.84, cell * 0.84);
      ctx.strokeStyle = C.burntEdge; ctx.lineWidth = 1.5;
      ctx.strokeRect(-cell * 0.42, -cell * 0.42, cell * 0.84, cell * 0.84);
      cracks(i, cell);
      if (powered && trace.outcome === 'short' && trace.fault === i && PB.lit >= Math.max(0, target - 0.15)) {
        const hit = 0.55 + 0.45 * Math.sin(performance.now() / 42) ** 2;
        ctx.globalAlpha = hit;
        ctx.strokeStyle = '#ff8a72'; ctx.lineWidth = 3;
        ctx.strokeRect(-cell * 0.46, -cell * 0.46, cell * 0.92, cell * 0.92);
        ctx.globalAlpha = 1;
      }
      ctx.restore(); ctx.globalAlpha = 1;
      continue;
    }

    if (c.kind === 'empty') {
      // 空槽平時慢呼吸；上桌或玩家點空槽時，診斷脈衝把同一個管型短暫描亮。
      // 它只說「這裡缺東西」，不沿解答路徑畫光，避免把正確轉法直接送給玩家。
      const breathe = 0.30 + 0.18 * (0.5 + 0.5 * Math.sin(performance.now() / 1000 * 3.4));
      const cue = missingCueLevel();
      ctx.save(); ctx.translate(cx, cy);
      ctx.globalAlpha = Math.max(unlit * breathe, 0.14, cue * 0.92);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = cue > 0 ? C.live : C.ghost;
      ctx.lineWidth = 1.5 + cue * 2.5;
      ctx.strokeRect(-cell * 0.40, -cell * 0.40, cell * 0.80, cell * 0.80);
      ctx.setLineDash([]);
      strokePipe(c.slot ?? 'straight', cell * 0.9, pw * 0.8 + cue * 5, cue > 0 ? C.liveHalo : C.ghost);
      if (cue > 0) strokePipe(c.slot ?? 'straight', cell * 0.9, pw * 0.25, C.liveCore);
      ctx.restore(); ctx.globalAlpha = 1;
      continue;
    }

    if (c.kind === 'diverter') {
      // 三口外形固定，中央刀閘只選東或南；不會同時分流。
      const k = 1 - Math.exp(-18 * dt);
      PB.ang[i] += ((PB.target[i] ?? 0) - PB.ang[i]) * k;
      ctx.save(); ctx.translate(cx, cy);
      ctx.globalAlpha = unlit;
      strokeMask(2 | 4 | 8, cell, pw + 6, C.pipeLo);
      strokeMask(2 | 4 | 8, cell, pw * 0.42, C.pipe);
      ctx.globalAlpha = 1;
      const activeMask = maskOf(c);
      if (lit) {
        strokeMask(activeMask, cell, pw + 6, C.liveHalo);
        strokeMask(activeMask, cell, pw, C.live);
        strokeMask(activeMask, cell, pw * 0.34, C.liveCore);
      } else {
        ctx.globalAlpha = unlit;
        strokeMask(activeMask, cell, pw, '#8c816d');
        ctx.globalAlpha = 1;
      }
      ctx.save(); ctx.rotate((PB.ang[i] * Math.PI) / 180);
      ctx.strokeStyle = lit ? C.liveCore : '#d0b878'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-cell * 0.08, 0); ctx.lineTo(cell * 0.31, 0); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = lit ? C.liveCore : '#b59c62';
      ctx.beginPath(); ctx.arc(0, 0, pw * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      continue;
    }
    // 顯示角度追目標角度：快速但看得見的旋轉（動手的回饋）
    const k = 1 - Math.exp(-18 * dt);
    PB.ang[i] += ((PB.target[i] ?? 0) - PB.ang[i]) * k;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((PB.ang[i] * Math.PI) / 180);
    if (lit) {
      strokePipe(c.kind, cell, pw + 6, C.liveHalo);
      strokePipe(c.kind, cell, pw, C.live);
      strokePipe(c.kind, cell, pw * 0.34, C.liveCore);
    } else {
      ctx.globalAlpha = unlit;
      strokePipe(c.kind, cell, pw + 3, C.pipeLo);
      strokePipe(c.kind, cell, pw, C.pipe);
      strokePipe(c.kind, cell, pw * 0.30, C.pipeHi);
      ctx.globalAlpha = 1;
    }
    // 接頭鉚釘
    ctx.fillStyle = lit ? C.liveCore : C.pipeHi;
    ctx.globalAlpha = lit ? 1 : unlit;
    ctx.beginPath(); ctx.arc(0, 0, pw * 0.22, 0, 6.283); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── 前緣電弧：斷點在哪，火花就在哪（唯一指向，同變電室的缺口） ──
  if (sparkOn) {
    const last = ch[litN - 1];
    if (last !== undefined) {
      const cx = gx + (last % 8 + 0.5) * cell;
      const cy = gy + (Math.floor(last / 8) + 0.5) * cell;
      ctx.strokeStyle = C.liveCore; ctx.lineWidth = 1.6;
      let a = ((last * 97 + Math.floor(PB.sparkT / 0.6) * 131) * 2654435761) >>> 0;
      const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let k = 0; k < 4; k++) {
        const th = rnd() * 6.283;
        const r0 = cell * 0.18, r1 = cell * (0.30 + rnd() * 0.22);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(th) * r0, cy + Math.sin(th) * r0);
        ctx.lineTo(cx + Math.cos(th) * r1 + (rnd() - 0.5) * 4, cy + Math.sin(th) * r1);
        ctx.stroke();
      }
    }
  }

  // ── 電磁閂（右下）：通電就退開 —— 這是「解開」在下方唯一的說法 ──
  {
    const y = gy + cell * 1.5;
    const x0 = gx + cell * 8;
    const slide = PB.latchT * term * 0.8;
    ctx.globalAlpha = Math.max(unlit, PB.latchT > 0 ? 0.9 : unlit);
    // 閂座
    ctx.fillStyle = C.plateEdge;
    ctx.fillRect(x0, y - cell * 0.28, term, cell * 0.56);
    // 閂舌：未通電時卡死（警示色），通電後滑開露出電流
    ctx.fillStyle = PB.latchT > 0 ? C.live : C.latch;
    ctx.fillRect(x0 + 2 + slide, y - cell * 0.14, term - 4, cell * 0.28);
    if (PB.latchT > 0) {
      ctx.strokeStyle = C.liveCore; ctx.lineWidth = cell * 0.1;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + slide, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  if (PB.dropT >= 0) PB.dropT += dt;
  if (PB.cueT >= 0) {
    PB.cueT += dt;
    if (PB.cueT >= MISSING_CUE_SEC) PB.cueT = -1;
  }
}
