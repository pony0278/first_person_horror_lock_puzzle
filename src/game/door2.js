/* 門 2：通電管線的流程層。
   規則在 logic/pipe.ts、畫面在 render/pipeboard.js —— 這裡只接三件事：
   點擊轉管、取回的零件落槽、通電之後收尾。

   與 transit 的關係全部走 hooks（state.js），不互相 import：
     transit 抵達門 2   → hooks.startDoor2()   → 盤面上桌
     取件演出結束       → hooks.door2Insert()  → 零件落槽（歪的），回 true 表示「還沒完，繼續解」
     newRound 重置      → hooks.resetDoor2()   → 全部收走

   抵達時會建立門 2 自己的 20 秒隱藏回合；奔跑過場不計時，通電瞬間才凍結。
   怪物沿共用站位時刻表重新從走廊最遠處追來，環境衰變則保留門 2 下限。 */

import { emptySlot, insertPiece, isSolved, reach, rotate } from '../logic/pipe.js';
import { newBoard, pickSpec } from '../logic/pipe.js';
import { $panel } from '../dom.js';
import { PB, cellAt, cueMissingPiece, drawPipe, missingCueLevel, pieceLand, pipeCanvas, showPipe, spinCell } from '../render/pipeboard.js';
import { setDoorPanel } from '../render/doorpanel.js';
import { markerLight } from '../render/hintwall.js';
import { CFG } from '../logic/config.js';
import { R, blind, hooks } from '../state.js';
import { beep, zap } from './audio.js';
import { interrupted } from './halt.js';
import { beginDoorRound, completeDoor } from './round.js';
import { T, finishTransit } from './transit.js';

export const D2 = { active: false, board: null, doneT: -1, cueSeen: 0 };

hooks.door2HasPiece = () => Boolean(D2.board && emptySlot(D2.board) === null);

hooks.startDoor2 = () => {
  D2.board = newBoard(pickSpec());          // §11：只抽不生成
  D2.active = true; D2.doneT = -1;

  // 奔跑不計時；抵達後才開始門 2 自己的 20 秒，怪物也從最遠站重新追。
  // 正面事件改用門 2 看得見的 refl / badge / glitch，避開已收走的鑰匙孔與拉把。
  beginDoorRound(2, CFG.round.limit, ['refl', 'badge', 'glitch'], CFG.stations.door2Hold);
  $panel.classList.add('door2');            // 先收 chrome 列（#pins 會長高），再量尺寸
  showPipe(D2.board);
  D2.cueSeen = PB.cueSerial - 1;            // 第一幀同步播放身後缺口火花
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
  D2.active = false; D2.board = null; D2.doneT = -1; D2.cueSeen = PB.cueSerial;
  PB.onAdvance = null;
  $panel.classList.remove('door2');
};

/* 點一下轉 90°（v3 §4）。空槽點了只有悶響 —— 東西還在牆上。
   回頭失能（§5）由 panel.blind 的 pointer-events 擋，這裡再守一層。 */
pipeCanvas.addEventListener('pointerdown', e => {
  if (!D2.active || !D2.board || D2.doneT >= 0 || R.over) return;
  if (T.phase !== 'door2' || blind() || interrupted()) return;
  const i = cellAt(e.clientX, e.clientY);
  if (i === null) return;
  if (rotate(D2.board, i)) {
    spinCell(i);
    beep('release');
    T.t = 0;                                      // 有在動就不算閒置（防卡死計時重來）
  } else if (D2.board.cells[i]?.kind === 'empty') {
    beep('thunk');
    cueMissingPiece();                         // 再說一次：這裡缺的東西在身後
  }
});

/** 每幀由 loop 呼叫。lampF 是走廊燈的即時亮度 —— 盤面吃同一條壞電路。 */
export function updateDoor2(dt, lampF) {
  if (!D2.active || !D2.board) return;
  drawPipe(D2.board, dt, lampF);
  const cueF = missingCueLevel();
  if (PB.cueSerial !== D2.cueSeen) {
    D2.cueSeen = PB.cueSerial;
    beep('falseSet');                          // 空槽與身後缺口同一拍回應
  }
  if (cueF > 0) markerLight.intensity = Math.max(markerLight.intensity, 0.8 + cueF * 2.8);
  // 門面 LCD：紅槓隨 reach 越接越穩，通電跳綠（render/doorpanel.js）
  setDoorPanel(reach(D2.board), D2.doneT >= 0, lampF, performance.now() / 1000);

  if (D2.doneT < 0 && isSolved(D2.board) && completeDoor()) {
    D2.doneT = 0;
  } else if (D2.doneT >= 0) {
    // 留一段給電流衝到閂、閂退開的演出，再交還 transit 收尾
    D2.doneT += dt;
    if (D2.doneT >= 1.2) {
      hooks.resetDoor2();
      finishTransit('通電 —— 門 3 施工中');
    }
  }
}
