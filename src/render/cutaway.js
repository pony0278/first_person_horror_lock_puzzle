/* 下方面板：機構剖面圖。
   風格化，不模擬材質：純色塊 + 輪廓線 + 折線彈簧。
   剪切線是唯一需要理解的東西，其餘都是它的註腳。 */

import * as THREE from 'three';
import { CFG } from '../logic/config.js';
import { GLYPH } from '../logic/glyphs.js';
import { $pins, $seq } from '../dom.js';
import { R, ST, pick, ui } from '../state.js';

export let tracks = [];

function glyphForPin(pin) {
  return GLYPH[pin];
}

function drawPinClue(ctx, pin, cx, cy, cell, height) {
  const glyph = glyphForPin(pin);
  const count = R.puzzle?.pinCounts?.[pin] ?? 0;
  const plateW = Math.min(cell * 0.30, 50);
  const plateH = Math.min(height * 0.36, 27);
  const top = cy - plateH / 2;

  ctx.save();
  ctx.globalAlpha = 0.96;
  ctx.fillStyle = '#24272b';
  ctx.fillRect(cx - plateW / 2, top, plateW, plateH);
  ctx.strokeStyle = '#8a8f91';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(cx - plateW / 2, top, plateW, plateH);

  ctx.fillStyle = glyph.c;
  ctx.font = `${Math.min(13, height * 0.17)}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(glyph.s, cx, cy - plateH * 0.20);

  const gap = Math.min(5, plateW * 0.105);
  const dotY = cy + plateH * 0.29;
  for (let index = 0; index < count; index++) {
    const dotX = cx + (index - (count - 1) / 2) * gap;
    ctx.beginPath(); ctx.arc(dotX, dotY, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
/* 跨模組會被重新賦值的狀態放進物件 —— ES module 的 import 是唯讀綁定，
   直接 export let 的話別的模組改不動它。 */

export let cutCanvas = null, cutCtx = null;
export const flashUntil = [];        // 每個栓位的錯誤閃爍到期時間

export function buildPins() {
  $pins.innerHTML = ''; tracks = [];
  flashUntil.length = 0;
  const cutaway = CFG.ui.style === 'cutaway';
  $pins.classList.toggle('cut', cutaway);

  if (cutaway) {
    cutCanvas = document.createElement('canvas');
    cutCanvas.id = 'cut';
    $pins.appendChild(cutCanvas);
    cutCtx = cutCanvas.getContext('2d');
    sizeCut();
    return;
  }
  for (let i = 0; i < CFG.lock.pinCount; i++) {
    const tr = document.createElement('div');
    tr.className = 'track'; tr.dataset.i = i;
    const dots = '•'.repeat(R.puzzle?.pinCounts?.[i] ?? 0);
    tr.innerHTML = `<div class="flash"></div>
      <div class="pin" style="background:${glyphForPin(i).c}">${glyphForPin(i).s}
        <small style="display:block;font-size:.42em;letter-spacing:.08em">${dots}</small></div>`;
    $pins.appendChild(tr); tracks.push(tr);
  }
}

export function sizeCut() {
  if (!cutCanvas) return;
  const dpr = Math.min(devicePixelRatio, 2);
  cutCanvas.width = $pins.clientWidth * dpr;
  cutCanvas.height = $pins.clientHeight * dpr;
  cutCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ── 機構剖面圖 ───────────────────────────────────────
   風格化，不模擬材質：純色塊 + 輪廓線 + 折線彈簧。
   剪切線是唯一需要理解的東西，其餘都是它的註腳。
   刻意不畫任何角度基準 —— 鎖芯轉了幾度只有門上看得出來。 */
export const CUT = {
  housing:'#31343a', housingHi:'#3a3e45', housingLo:'#26292e',
  plug:'#42464d', plugHi:'#4d525a', plugLo:'#33363c',
  keyway:'#141519', chamber:'#1e2025', chamberEdge:'#17181c',
  steel:'#767d86', steelHi:'#8b939d', steelLo:'#5c6169',
  brass:'#997a3d', brassHi:'#b5924c', brassLo:'#77602f',
  spring:'#6a727c', shear:'#c8b98f', line:'#17181c', below:'#101114',
};

/* 垂直圓柱感：左暗、中亮帶、右暗 */
export function cylRect(ctx, x0, y0, x1, y1, base, hi, lo) {
  const w = x1 - x0;
  ctx.fillStyle = base; ctx.fillRect(x0, y0, w, y1 - y0);
  ctx.fillStyle = lo;   ctx.fillRect(x0, y0, w * 0.16, y1 - y0);
  ctx.fillStyle = hi;   ctx.fillRect(x0 + w * 0.22, y0, w * 0.24, y1 - y0);
  ctx.fillStyle = lo;   ctx.fillRect(x1 - w * 0.14, y0, w * 0.14, y1 - y0);
}


export function drawCutaway(tint = 0) {
  if (!cutCtx) return;
  const w = $pins.clientWidth, h = $pins.clientHeight;
  const n = CFG.lock.pinCount;
  const ctx = cutCtx;
  const now = performance.now();

  // 佈局（比例沿用風格草圖）
  //
  // ── 垂直預算 ──
  // TRAVEL 是栓從 idle 落到 set 的行程，也是剖面圖上唯一承載資訊的距離。
  // 原本固定為 h*0.115：桌機（h≈310）是 36px，手機橫向（h≈85）只剩 10px，
  // 而 idle→partial 只有它的 40%，也就是 4px 上下 —— 設計文件 §7
  // 「靠針的高度即可分辨」在目標姿勢下就不成立了。
  // 因此先給行程一個像素目標，不足的部分向上（殼體）與向下（鎖芯底部）借。
  // 桌機與直向的 h*0.115 本來就超過目標，need 為 0，佈局完全不變。
  const base   = h * 0.115;                        // 原始比例
  const need   = Math.max(0, Math.min(24, h * 0.30) - base);
  const up     = Math.min(need,      h * 0.14);    // 向殼體借（借過頭彈簧會被壓扁）
  const down   = Math.min(need - up, h * 0.07);    // 再向鎖芯底部的裝飾帶借
  const TRAVEL = base + up + down;

  const TOP = h * 0.075, SHEAR = h * 0.475 - up, PLUG_BOT = h * 0.755 + down;
  const KEY_T = h * 0.645 + down, KEY_B = h * 0.71 + down;
  const CAP_R = h * 0.16;                       // 鎖芯端蓋
  const left = CAP_R * 2.1;                     // 栓室區從端蓋右側開始
  const cell = (w - left) / n;
  const CW = Math.min(cell * 0.62, 86), PW = Math.min(cell * 0.40, 54);
  const DRIVER = h * 0.145, KEYPIN = h * 0.13;
  const cxOf = i => left + cell * (i + 0.5);

  ctx.clearRect(0, 0, w, h);

  // ── 殼體 ──
  ctx.fillStyle = CUT.housing;   ctx.fillRect(0, TOP, w, SHEAR - TOP);
  ctx.fillStyle = CUT.housingHi; ctx.fillRect(0, TOP, w, h * 0.018);
  ctx.fillStyle = CUT.housingLo; ctx.fillRect(0, SHEAR - h * 0.02, w, h * 0.02);

  // ── 鎖芯（水平圓柱）──
  ctx.fillStyle = CUT.plug;   ctx.fillRect(0, SHEAR, w, PLUG_BOT - SHEAR);
  ctx.fillStyle = CUT.plugLo; ctx.fillRect(0, SHEAR, w, h * 0.038);
  ctx.fillStyle = CUT.plugHi; ctx.fillRect(0, SHEAR + h * 0.07, w, h * 0.09);
  ctx.fillStyle = CUT.plugLo; ctx.fillRect(0, PLUG_BOT - h * 0.045, w, h * 0.045);
  ctx.fillStyle = CUT.below;  ctx.fillRect(0, PLUG_BOT, w, h - PLUG_BOT);

  // ── 鑰匙道 ──
  ctx.fillStyle = CUT.keyway; ctx.fillRect(0, KEY_T, w, KEY_B - KEY_T);
  ctx.fillStyle = '#0a0b0d';  ctx.fillRect(0, KEY_T, w, 2.5);

  // ── 剪切線：貫穿全寬，介面的主角 ──
  ctx.strokeStyle = CUT.shear; ctx.globalAlpha = 0.42; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, SHEAR); ctx.lineTo(w, SHEAR); ctx.stroke();
  ctx.globalAlpha = 1;

  // ── 栓室與栓 ──
  const seamOf = st =>
    st === 'idle'     ? SHEAR + TRAVEL
  : st === 'partial'  ? SHEAR + TRAVEL * (1 - CFG.lock.partialH)
  : st === 'falseSet' ? SHEAR - h * 0.028   // 假到位刻意維持細微（設計文件 §9）
  : SHEAR;

  for (let i = 0; i < n; i++) {
    const cx = cxOf(i), st = R.lock.pins[i];
    const x0 = cx - PW / 2, x1 = cx + PW / 2;

    // 栓室
    ctx.fillStyle = CUT.chamberEdge;
    ctx.fillRect(cx - CW / 2, TOP + h * 0.04, CW, KEY_T - TOP - h * 0.04);
    ctx.fillStyle = CUT.chamber;
    ctx.fillRect(cx - CW / 2 + 2.5, TOP + h * 0.04, CW - 5, KEY_T - TOP - h * 0.04);

    // 栓室內的剪切線段（半透明，讓整條線連續）
    ctx.strokeStyle = CUT.shear; ctx.globalAlpha = 0.30; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - CW / 2, SHEAR); ctx.lineTo(cx + CW / 2, SHEAR); ctx.stroke();
    ctx.globalAlpha = 1;

    let seam = seamOf(st);
    // 選中的栓被工具頂起時的即時位移（尚未鬆手的視覺）
    if (i === ui.sel && pick.lift > 0 && (st === 'idle' || st === 'partial')) {
      seam -= pick.lift * TRAVEL * 0.52;      // 跟著行程縮放，維持與狀態差的比例
    }

    // 彈簧
    const sTop = TOP + h * 0.065, sBot = seam - DRIVER - h * 0.015;
    ctx.strokeStyle = CUT.spring; ctx.lineWidth = 2.2;
    ctx.beginPath();
    const coils = 5;
    for (let c = 0; c <= coils * 2; c++) {
      const yy = sTop + Math.max(6, sBot - sTop) * c / (coils * 2);
      const xx = cx + (c % 2 ? PW * 0.34 : -PW * 0.34);
      c === 0 ? ctx.moveTo(cx, yy) : ctx.lineTo(xx, yy);
    }
    ctx.lineTo(cx, sBot + 3); ctx.stroke();

    // 驅動栓（鋼）＋暗色端面
    cylRect(ctx, x0, seam - DRIVER, x1, seam, CUT.steel, CUT.steelHi, CUT.steelLo);
    ctx.fillStyle = CUT.steelLo;
    ctx.beginPath(); ctx.ellipse(cx, seam - DRIVER, PW / 2, h * 0.016, 0, 0, 6.283); ctx.fill();

    // 鑰匙栓（銅）＋圓底
    const kb = Math.min(seam + KEYPIN, KEY_T - 2);
    cylRect(ctx, x0, seam, x1, kb, CUT.brass, CUT.brassHi, CUT.brassLo);
    ctx.fillStyle = CUT.brassHi; ctx.strokeStyle = CUT.brassLo; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(cx, kb, PW / 2, h * 0.02, 0, 0, 6.283); ctx.fill(); ctx.stroke();

    // 接縫
    ctx.strokeStyle = CUT.line; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0, seam); ctx.lineTo(x1, seam); ctx.stroke();

    // 到位：該栓位剪切線加亮
    if (st === 'set') {
      ctx.strokeStyle = CUT.shear; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx - CW / 2 - 5, SHEAR); ctx.lineTo(cx + CW / 2 + 5, SHEAR); ctx.stroke();
    }
    // 假到位：驅動栓底卡在剪切線台階
    if (st === 'falseSet') {
      ctx.fillStyle = CUT.plugHi; ctx.strokeStyle = CUT.line; ctx.lineWidth = 1;
      ctx.fillRect(cx - CW / 2 - 5, SHEAR - 2, (CW - PW) / 2 + 4, h * 0.028);
      ctx.strokeRect(cx - CW / 2 - 5, SHEAR - 2, (CW - PW) / 2 + 4, h * 0.028);
      ctx.fillRect(cx + PW / 2 + 1, SHEAR - 2, (CW - PW) / 2 + 4, h * 0.028);
      ctx.strokeRect(cx + PW / 2 + 1, SHEAR - 2, (CW - PW) / 2 + 4, h * 0.028);
    }

    // 檢修牌（殼體上緣）：符號在上、點數在下，與牆面使用同一資訊單位。
    drawPinClue(ctx, i, cx, TOP + h * 0.022 + 9, cell, h);

    // 選中框
    if (i === ui.sel) {
      ctx.strokeStyle = '#c8b98f'; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - CW / 2 - 4, TOP + 2, CW + 8, KEY_B - TOP + 4);
      ctx.globalAlpha = 1;
    }
    // 錯誤閃爍
    if ((flashUntil[i] || 0) > now) {
      ctx.fillStyle = 'rgba(165,103,95,.30)';
      ctx.fillRect(cx - cell / 2, 0, cell, h);
    }
  }

  // ── 鎖芯端蓋：完整的圓，張力扳手插在圓面上、隨鎖芯轉 ──
  {
    const capX = CAP_R * 1.05, capY = (SHEAR + PLUG_BOT) / 2;
    ctx.fillStyle = CUT.plugHi; ctx.strokeStyle = CUT.line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(capX, capY, CAP_R, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.fillStyle = CUT.plug;
    ctx.beginPath(); ctx.arc(capX, capY, CAP_R * 0.72, 0, 6.283); ctx.fill();

    const ang = -THREE.MathUtils.degToRad(R.lock.cylinderDeg);
    ctx.save(); ctx.translate(capX, capY); ctx.rotate(ang);
    // 端面上的鑰匙孔縫
    ctx.fillStyle = CUT.keyway;
    ctx.fillRect(-CAP_R * 0.1, -CAP_R * 0.62, CAP_R * 0.2, CAP_R * 1.24);
    // 張力扳手：插進縫裡，柄向下伸出端蓋
    ctx.fillStyle = CUT.steel;
    ctx.fillRect(-3.5, CAP_R * 0.1, 7, CAP_R * 1.7);
    ctx.fillStyle = CUT.steelHi;
    ctx.fillRect(-3.5, CAP_R * 0.1, 3, CAP_R * 1.7);
    ctx.restore();
  }

  // ── 撬針：從鑰匙道伸入，尖端頂在選中栓下方（加粗版）──
  {
    const targetX = cxOf(ui.sel);
    pick.x += (targetX - pick.x) * 0.35;         // 每幀重畫，直接就地平滑
    const py = (KEY_T + KEY_B) / 2;
    const bend = pick.x - PW * 0.9;
    const tipY = KEY_T - 3 - pick.lift * h * 0.055;

    ctx.lineCap = 'round';
    ctx.strokeStyle = CUT.steelLo; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(6, py + 2); ctx.lineTo(bend, py + 2); ctx.stroke();
    ctx.strokeStyle = CUT.steelHi; ctx.lineWidth = 6.5;
    ctx.beginPath(); ctx.moveTo(6, py); ctx.lineTo(bend, py);
    ctx.lineTo(pick.x - 4, tipY); ctx.stroke();
    ctx.fillStyle = CUT.steelHi;
    ctx.beginPath(); ctx.arc(pick.x - 4, tipY, 4, 0, 6.283); ctx.fill();
    ctx.lineCap = 'butt';
  }

  // ── 威脅滲入 ──
  if (tint > 0) {
    const g = ctx.createLinearGradient(0, h * 0.4, 0, h);
    g.addColorStop(0, 'rgba(140,30,26,0)');
    g.addColorStop(1, `rgba(140,30,26,${tint})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
}

export function renderPins() {
  if (CFG.ui.style === 'cutaway') drawCutaway(CFG.dread.tint[ST.index] || 0);
  else tracks.forEach((tr, i) => {
    const st = R.lock.pins[i];
    const frac = st === 'idle' ? 0 : st === 'partial' ? CFG.lock.partialH : 1;
    const pin = tr.querySelector('.pin');
    pin.style.bottom = `calc(${frac * 100}% * 0.80 + 2px)`;
    pin.style.opacity = frac === 0 ? .55 : 1;
    tr.classList.toggle('sel', i === ui.sel);
  });

  $seq.innerHTML = R.history.length
    ? R.history.map(h => {
        const cls = h.r === 'set' ? 'ok' : h.r === 'falseSet' ? 'fake' : 'err';
        const m = h.r === 'set' ? '✓' : h.r === 'falseSet' ? '?' : '✕';
        return `<span class="step ${cls}" style="color:${glyphForPin(h.i).c}">${glyphForPin(h.i).s}<small>${m}</small></span>`;
      }).join('')
    : '';
}

export function flashTrack(i) {
  if (CFG.ui.style === 'cutaway') { flashUntil[i] = performance.now() + 130; return; }
  const f = tracks[i].querySelector('.flash');
  f.style.opacity = .35; setTimeout(() => f.style.opacity = 0, 110);
}
