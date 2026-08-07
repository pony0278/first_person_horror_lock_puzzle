/* 門 2：通電管線的流程層。
   規則在 logic/pipe.ts、畫面在 render/pipeboard.js —— 這裡只接三件事：
   點擊轉管、取回的零件落槽、通電之後收尾。

   與 transit 的關係全部走 hooks（state.js），不互相 import：
     transit 抵達門 2   → hooks.startDoor2()   → 盤面上桌
     取件演出結束       → hooks.door2Insert()  → 零件落槽（歪的），回 true 表示「還沒完，繼續解」
     newRound 重置      → hooks.resetDoor2()   → 全部收走

   計時器現況：整段 R.over=true，隱藏計時凍結 —— 門 2 目前能解但不可怕。
   時鐘與怪物是下一步（接上 HiddenTimer 的門 2 段），這裡刻意不先偷接。 */

import { emptySlot, insertPiece, isSolved, reach, rotate } from '../logic/pipe.js';
import { newBoard, pickSpec } from '../logic/pipe.js';
import { $panel } from '../dom.js';
import { PB, cellAt, drawPipe, pieceLand, pipeCanvas, showPipe, spinCell } from '../render/pipeboard.js';
import { setDoorPanel } from '../render/doorpanel.js';
import { CFG } from '../logic/config.js';
import { R, ST, blind, hooks } from '../state.js';
import { beep, zap } from './audio.js';
import { interrupted } from './halt.js';
import { T, finishTransit } from './transit.js';

export const D2 = { active: false, board: null, doneT: -1 };

hooks.startDoor2 = () => {
  D2.board = newBoard(pickSpec());          // §11：只抽不生成
  D2.active = true; D2.doneT = -1;

  // 這一扇門的身分。R.over 以前一體兩用，拆開之後由 R.door 決定
  // 「下方該畫哪一種面板」「正面事件用哪一組」。
  // R.limit 目前與門 1 同值（20s）—— 依據見 v3 §3：時限＝熟練時間＋逐門遞減的餘裕。
  R.door = 2; R.limit = CFG.round.limit;

  // 正面事件換成門 2 的：門 2 沒有鑰匙孔也沒有拉把，eye / lever 會變成
  // 「有聲音沒畫面」的啞彈（事件照樣觸發、照樣消耗配額，玩家什麼都看不到）。
  const S = CFG.stations;
  ST.frontPool = ['refl', 'badge', 'glitch'].sort(() => Math.random() - 0.5);
  ST.frontLeft = S.frontMin + Math.floor(Math.random() * (S.frontMax - S.frontMin + 1));
  ST.front = null; ST.frontT = 0; ST.frontCool = 0;
  $panel.classList.add('door2');            // 先收 chrome 列（#pins 會長高），再量尺寸
  showPipe(D2.board);
  PB.onAdvance = (_n, reach01) => zap(reach01);   // 爬多遠、音多高 —— 回頭時用聽的
};

hooks.door2Insert = () => {
  if (!D2.active || !D2.board) return false;
  const slot = emptySlot(D2.board);
  if (slot === null || !insertPiece(D2.board)) return false;
  pieceLand(slot, D2.board.cells[slot].rot);      // 落下 —— 而且是歪的（v3 §4）
  beep('thunk');
  return true;                                    // 告訴 transit：還沒完，回 door2 繼續解
};

hooks.resetDoor2 = () => {
  D2.active = false; D2.board = null; D2.doneT = -1;
  R.door = 1; R.limit = CFG.round.limit;
  PB.onAdvance = null;
  $panel.classList.remove('door2');
};

/* 點一下轉 90°（v3 §4）。空槽點了只有悶響 —— 東西還在牆上。
   回頭失能（§5）由 panel.blind 的 pointer-events 擋，這裡再守一層。 */
pipeCanvas.addEventListener('pointerdown', e => {
  if (!D2.active || !D2.board || D2.doneT >= 0) return;
  if (T.phase !== 'door2' || blind() || interrupted()) return;
  const i = cellAt(e.clientX, e.clientY);
  if (i === null) return;
  if (rotate(D2.board, i)) {
    spinCell(i);
    beep('release');
    T.t = 0;                                      // 有在動就不算閒置（防卡死計時重來）
  } else if (D2.board.cells[i]?.kind === 'empty') {
    beep('thunk');
  }
});

/** 每幀由 loop 呼叫。lampF 是走廊燈的即時亮度 —— 盤面吃同一條壞電路。 */
export function updateDoor2(dt, lampF) {
  if (!D2.active || !D2.board) return;
  drawPipe(D2.board, dt, lampF);
  // 門面 LCD：紅槓隨 reach 越接越穩，通電跳綠（render/doorpanel.js）
  setDoorPanel(reach(D2.board), D2.doneT >= 0, lampF, performance.now() / 1000);

  if (D2.doneT < 0 && isSolved(D2.board)) {
    D2.doneT = 0;
    beep('solved');
  } else if (D2.doneT >= 0) {
    // 留一段給電流衝到閂、閂退開的演出，再交還 transit 收尾
    D2.doneT += dt;
    if (D2.doneT >= 1.2) {
      hooks.resetDoor2();
      finishTransit('通電 —— 門 3 施工中');
    }
  }
}
