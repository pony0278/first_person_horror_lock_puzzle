import { describe, expect, it } from 'vitest';
import { HiddenTimer, door2Cause, primaryCause, stationThresholds } from '../src/logic/round';

/** 可控的時鐘，免得測試去睡真的秒數。 */
function fakeClock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('隱藏計時器', () => {
  it('以牆鐘計時，不受幀率影響', () => {
    const c = fakeClock();
    const timer = new HiddenTimer(c.now);
    timer.start();
    c.advance(5000);
    expect(timer.elapsed).toBeCloseTo(5);
  });

  it('hold() 讓計時器在開場演出期間不啟動', () => {
    const c = fakeClock();
    const timer = new HiddenTimer(c.now);
    timer.start();
    for (let i = 0; i < 10; i++) { c.advance(100); timer.hold(); }
    expect(timer.elapsed).toBeCloseTo(0);
  });

  it('錯誤懲罰直接加在經過時間上（§6 的怪物瞬移換算）', () => {
    const c = fakeClock();
    const timer = new HiddenTimer(c.now);
    timer.start();
    c.advance(3000);
    timer.addPenalty(3.5);
    expect(timer.elapsed).toBeCloseTo(6.5);
  });

  /** 報告 H2 的修法就靠這個 —— 目前尚未接上 visibilitychange。 */
  describe('暫停（H2 的修法基礎）', () => {
    it('暫停期間不累加時間', () => {
      const c = fakeClock();
      const timer = new HiddenTimer(c.now);
      timer.start();
      c.advance(2000);
      timer.pause();
      c.advance(30000);          // 使用者切到別的 App 半分鐘
      timer.resume();
      c.advance(1000);
      expect(timer.elapsed).toBeCloseTo(3);
    });

    it('暫停中讀 elapsed 得到凍結的值', () => {
      const c = fakeClock();
      const timer = new HiddenTimer(c.now);
      timer.start();
      c.advance(4000);
      timer.pause();
      c.advance(9000);
      expect(timer.elapsed).toBeCloseTo(4);
      expect(timer.paused).toBe(true);
    });

    it('重複 pause / resume 不會讓時間跑掉', () => {
      const c = fakeClock();
      const timer = new HiddenTimer(c.now);
      timer.start();
      c.advance(1000);
      timer.pause(); timer.pause();
      c.advance(5000);
      timer.resume(); timer.resume();
      c.advance(1000);
      expect(timer.elapsed).toBeCloseTo(2);
    });
  });

  describe('具名暫停（H2 與 H3 可能同時發生）', () => {
    it('兩個原因都解除才會繼續走', () => {
      const c = fakeClock();
      const timer = new HiddenTimer(c.now);
      timer.start();
      c.advance(1000);

      timer.pause('hidden');              // 切到背景
      timer.pause('contextlost');         // 同時 WebGL context 也掉了
      c.advance(10000);

      timer.resume('hidden');             // 回到前景，但畫面還沒回來
      expect(timer.paused).toBe(true);
      expect(timer.pauseReasons).toEqual(['contextlost']);
      c.advance(5000);
      expect(timer.elapsed).toBeCloseTo(1);

      timer.resume('contextlost');        // 畫面回來了
      expect(timer.paused).toBe(false);
      c.advance(2000);
      expect(timer.elapsed).toBeCloseTo(3);
    });

    it('解除一個沒記過的原因不會誤放行', () => {
      const c = fakeClock();
      const timer = new HiddenTimer(c.now);
      timer.start();
      timer.pause('contextlost');
      c.advance(3000);
      timer.resume('hidden');             // 從來沒因為 hidden 暫停過
      expect(timer.paused).toBe(true);
      c.advance(3000);
      expect(timer.elapsed).toBeCloseTo(0);
    });

    /**
     * 迴歸測試：hold() 原本只推 t0，暫停中的 pausedAt 會留在過去，
     * elapsed 因此變成負數而且持續變負。實際觸發路徑是「在背景中死亡重開」——
     * 死亡後 1.5 秒自動 newRound，開場演出每幀呼叫 hold()，而 App 還在背景。
     * CI 上跑出 elapsed -5.82 → -10.34 才發現。
     */
    it('暫停中跑開場演出，elapsed 不會變成負數', () => {
      const c = fakeClock();
      const timer = new HiddenTimer(c.now);
      timer.start();
      timer.pause('hidden');
      c.advance(2000);

      timer.start();                      // 背景中死亡重開
      for (let i = 0; i < 30; i++) {      // 開場演出每幀 hold()
        c.advance(100);
        timer.hold();
      }
      expect(timer.elapsed).toBeCloseTo(0);
      expect(timer.elapsed).toBeGreaterThanOrEqual(0);

      timer.resume('hidden');             // 回到前景，從 0 開始跑
      c.advance(1500);
      expect(timer.elapsed).toBeCloseTo(1.5);
    });

    it('在暫停中開新回合，仍以暫停狀態起跑', () => {
      const c = fakeClock();
      const timer = new HiddenTimer(c.now);
      timer.start();
      timer.pause('hidden');
      c.advance(2000);

      timer.start();                      // 死亡後 1.5 秒自動重開，此時還在背景
      c.advance(8000);
      expect(timer.paused).toBe(true);
      expect(timer.elapsed).toBeCloseTo(0);

      timer.resume('hidden');
      c.advance(1000);
      expect(timer.elapsed).toBeCloseTo(1);
    });
  });
});

describe('站位時刻表', () => {
  it('門 1 與門 2 各自累加成總時間守恆的切換點', () => {
    const door1 = stationThresholds([0.35, 0.20, 0.15, 0.30], 20);
    [7, 11, 14, 20].forEach((t, i) => expect(door1[i]).toBeCloseTo(t));
    const door2 = stationThresholds([0.35, 0.20, 0.15, 0.30], 20);
    [7, 11, 14, 20].forEach((t, i) => expect(door2[i]).toBeCloseTo(t));
  });

  it('最後一個時間點正好是時限 —— 總時間守恆（§6）', () => {
    const t = stationThresholds([0.3, 0.3, 0.4], 25);
    expect(t[t.length - 1]).toBeCloseTo(25);
  });

  it('比例加總不為 1 就丟錯，避免曲線偷偷改變總時間', () => {
    expect(() => stationThresholds([0.3, 0.3, 0.3], 20)).toThrow(RangeError);
    expect(() => stationThresholds([0.5, 0.6], 20)).toThrow(RangeError);
  });
});

describe('失敗原因（§12：只講一個原因）', () => {
  const base = { jamSec: 0, lookSec: 0, errorCount: 0, errorSec: 0.4 };

  it('點名損失時間最多的那一項', () => {
    expect(primaryCause({ ...base, jamSec: 6, lookSec: 2 })).toBe('卡在假針太久');
    expect(primaryCause({ ...base, jamSec: 2, lookSec: 6 })).toBe('回頭看太多次');
    expect(primaryCause({ ...base, errorCount: 20 })).toBe('連續操作錯誤');
  });

  it('沒有任何一項超過門檻就歸因於時間不夠', () => {
    expect(primaryCause({ ...base, jamSec: 1, lookSec: 1, errorCount: 2 })).toBe('時間不夠');
  });

  it('剛好在門檻上不算 —— 要嚴格大於', () => {
    expect(primaryCause({ ...base, jamSec: 1.5 })).toBe('時間不夠');
    expect(primaryCause({ ...base, jamSec: 1.6 })).toBe('卡在假針太久');
  });
});

describe('門 2 失敗原因', () => {
  it('保險絲還沒取回時點名取件太晚', () => {
    expect(door2Cause(false)).toBe('你太晚去拿保險絲');
  });

  it('保險絲已取回後只歸因時間不足', () => {
    expect(door2Cause(true)).toBe('時間不夠');
  });

  it('第二根保險絲熔斷時只回報最後的致命原因', () => {
    expect(door2Cause(false, 2)).toBe('備用保險絲也熔斷了');
  });
});
