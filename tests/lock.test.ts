import { describe, expect, it, vi } from 'vitest';
import { LockState, UnsupportedRuleError, seededLock } from '../src/logic/lock';
import type { PinIndex } from '../src/logic/pins';

/** 造一把組合已知的鎖，測試才不用跟亂數搏鬥。 */
function rigged(falsePins: PinIndex[], trueOrder: PinIndex[], pinCount = 4): LockState {
  const lock = new LockState({ pinCount, falseCount: falsePins.length });
  lock.falsePins = new Set(falsePins);
  lock.trueOrder = trueOrder;
  lock.clear();
  return lock;
}

describe('組合產生', () => {
  it('假針與真針不重疊，且兩者合起來涵蓋所有栓位', () => {
    for (let seed = 0; seed < 200; seed++) {
      const lock = seededLock(seed, { pinCount: 6, falseCount: 2 });
      const all = [...lock.falsePins, ...lock.trueOrder].sort((a, b) => a - b);
      expect(all).toEqual([0, 1, 2, 3, 4, 5]);
      expect(lock.trueOrder).toHaveLength(4);
    }
  });

  it('同一個種子給出同一組配置（F4 每日挑戰要用）', () => {
    const a = seededLock(1337, { pinCount: 6, falseCount: 2 });
    const b = seededLock(1337, { pinCount: 6, falseCount: 2 });
    expect([...a.falsePins]).toEqual([...b.falsePins]);
    expect(a.trueOrder).toEqual(b.trueOrder);
  });

  it('假針數不得多於或等於總針數 —— 否則沒有真針可解', () => {
    expect(() => new LockState({ pinCount: 4, falseCount: 4 })).toThrow(RangeError);
  });
});

describe('推針', () => {
  it('照順序頂真針會逐支固定，鎖芯累進轉動', () => {
    const lock = rigged([1], [0, 2, 3]);
    expect(lock.cylinderDeg).toBe(0);
    expect(lock.push(0)).toBe('set');
    expect(lock.cylinderDeg).toBe(9);
    expect(lock.push(2)).toBe('set');
    expect(lock.cylinderDeg).toBe(18);
    expect(lock.push(3)).toBe('set');
    expect(lock.solved).toBe(true);
  });

  it('順序錯的真針只會頂到 partial，並計入錯誤', () => {
    const lock = rigged([1], [0, 2, 3]);
    expect(lock.push(2)).toBe('error');
    expect(lock.pins[2]).toBe('partial');
    expect(lock.errors).toBe(1);
    expect(lock.cylinderDeg).toBe(0);
  });

  it('假針會固定住，但鎖芯不動 —— 下方看不出來，上方看得出來（§9）', () => {
    const lock = rigged([1], [0, 2, 3]);
    expect(lock.push(1)).toBe('falseSet');
    expect(lock.pins[1]).toBe('falseSet');
    expect(lock.cylinderDeg).toBe(0);
    expect(lock.jammed).toBe(true);
  });

  it('卡住時連對的針也推不動（§7）', () => {
    const lock = rigged([1], [0, 2, 3]);
    lock.push(1);
    expect(lock.push(0)).toBe('error');
    expect(lock.progress).toBe(0);
  });

  it('對已固定或已假固定的針再推一次不計為錯誤', () => {
    const lock = rigged([1], [0, 2, 3]);
    lock.push(0);
    expect(lock.push(0)).toBe('ignored');
    expect(lock.errors).toBe(0);
  });

  it('解開之後所有輸入都被忽略', () => {
    const lock = rigged([1], [0, 2, 3]);
    lock.push(0); lock.push(2); lock.push(3);
    expect(lock.solved).toBe(true);
    expect(lock.push(1)).toBe('ignored');
  });

  it('不存在的栓位會丟錯，而不是安靜地什麼都不做', () => {
    const lock = rigged([1], [0, 2, 3]);
    expect(() => lock.push(9)).toThrow(RangeError);
    expect(() => lock.release(-1)).toThrow(RangeError);
  });
});

describe('連續錯誤與 severe（§6：怪物瞬移，不是提速）', () => {
  it('連錯 3 次觸發 severe，計數隨即歸零', () => {
    const lock = rigged([1], [0, 2, 3]);
    const severe = vi.fn();
    lock.on('severe', severe);
    lock.push(2); lock.push(3); lock.push(2);
    expect(severe).toHaveBeenCalledTimes(1);
    expect(lock.consecutive).toBe(0);
  });

  it('中間成功一次就會打斷連續計數', () => {
    const lock = rigged([1], [0, 2, 3]);
    const severe = vi.fn();
    lock.on('severe', severe);
    lock.push(2);      // 錯
    lock.push(3);      // 錯
    lock.push(0);      // 對 —— 連續歸零
    lock.push(3);      // 錯
    expect(severe).not.toHaveBeenCalled();
  });
});

describe('洩壓（§4：識破假針後必須能放下它）', () => {
  it('洩掉假針就解除卡住', () => {
    const lock = rigged([1], [0, 2, 3]);
    lock.push(1);
    expect(lock.jammed).toBe(true);
    lock.release(1);
    expect(lock.jammed).toBe(false);
    expect(lock.push(0)).toBe('set');
  });

  it('全部洩壓把盤面清空、進度歸零', () => {
    const lock = rigged([1], [0, 2, 3]);
    lock.push(0); lock.push(2);
    expect(lock.progress).toBe(2);
    lock.releaseAll();
    expect(lock.pins.every((p) => p === 'idle')).toBe(true);
    expect(lock.progress).toBe(0);
  });

  it('洩掉最後固定的那支，進度退一格', () => {
    const lock = rigged([1], [0, 2, 3]);
    lock.push(0); lock.push(2);
    lock.release(2);
    expect(lock.progress).toBe(1);
    expect(lock.nextTruePin).toBe(2);
  });

  /**
   * 迴歸測試：舊版把 progress 存成欄位、release 只做 progress--，
   * 於是洩掉「中間」那支已固定的真針之後，nextTruePin 會指向一支狀態仍是
   * 'set' 的針，而 push() 對 'set' 回傳 'ignored' —— 鎖再也推不動，
   * 只能靠全部洩壓救回來。改成由盤面推導 progress 之後就不會了。
   */
  it('洩掉中間那支已固定的真針不會讓鎖卡死', () => {
    const lock = rigged([1], [2, 0, 3]);
    lock.push(2); lock.push(0);
    expect(lock.progress).toBe(2);

    lock.release(2);                       // 洩掉的是順序上的第一支

    expect(lock.nextTruePin).toBe(2);      // 指回那支剛被洩掉的（idle）
    expect(lock.push(2)).toBe('set');      // 而且真的推得動
    expect(lock.progress).toBe(2);         // 0 還固定著，所以直接回到 2
    expect(lock.push(3)).toBe('set');
    expect(lock.solved).toBe(true);
  });

  it('解開之後洩壓無效', () => {
    const lock = rigged([1], [0, 2, 3]);
    lock.push(0); lock.push(2); lock.push(3);
    lock.releaseAll();
    expect(lock.pins[0]).toBe('set');
  });
});

describe('事件', () => {
  it('每種轉換都發出對應事件，payload 帶著栓位', () => {
    const lock = rigged([1], [0, 2, 3]);
    const seen: string[] = [];
    lock.on('set', (p) => seen.push(`set:${p.pin}`));
    lock.on('falseSet', (p) => seen.push(`false:${p.pin}`));
    lock.on('error', (p) => seen.push(`err:${p.pin}`));
    lock.on('release', (p) => seen.push(`rel:${p.pin}:${p.was}`));
    lock.on('solved', () => seen.push('solved'));

    lock.push(0); lock.push(1); lock.release(1); lock.push(2); lock.push(3);
    expect(seen).toEqual(['set:0', 'false:1', 'rel:1:falseSet', 'set:2', 'set:3', 'solved']);
  });

  it('solved 只發一次', () => {
    const lock = rigged([1], [0, 2, 3]);
    const solved = vi.fn();
    lock.on('solved', solved);
    lock.push(0); lock.push(2); lock.push(3);
    lock.push(3);
    expect(solved).toHaveBeenCalledTimes(1);
  });
});

describe('F1 難度變體（設計文件 §7）', () => {
  it('尚未實作的變體會直接丟錯，不會安靜地當成基礎跑', () => {
    expect(() => new LockState({ rules: [{ kind: 'twin', pins: [0, 1] }] }))
      .toThrow(UnsupportedRuleError);
    expect(() => new LockState({ rules: [{ kind: 'slip', pin: 0, slipAfterMs: 1200 }] }))
      .toThrow(UnsupportedRuleError);
  });

  it('基礎變體可以正常建立', () => {
    expect(() => new LockState({ rules: [{ kind: 'basic' }] })).not.toThrow();
  });
});

describe('六針兩假針（F1 的門 3 配置，§11）', () => {
  it('狀態機本身已經吃得下，不需要改邏輯', () => {
    const lock = seededLock(7, { pinCount: 6, falseCount: 2 });
    for (const p of lock.trueOrder) expect(lock.push(p)).toBe('set');
    expect(lock.solved).toBe(true);
    expect(lock.cylinderDeg).toBe(4 * 9);
  });
});
