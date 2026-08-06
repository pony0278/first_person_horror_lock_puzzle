import { describe, expect, it } from 'vitest';
import { HiddenTimer, primaryCause, stationThresholds } from '../src/logic/round';

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
  it('把停留比例累加成切換時間點', () => {
    expect(stationThresholds([0.26, 0.16, 0.12, 0.46], 20))
      .toEqual([5.2, 8.4, 10.8, 20]);
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
