import { describe, expect, it } from 'vitest';
import {
  installEnglishPlayerUi,
  translatePlayerText,
} from '../src/game/localization.js';

describe('CG6 English player localization', () => {
  it('translates the player-facing Door 1/2/3 and ending strings', () => {
    const cases = new Map([
      ['按住畫面 = 回頭　·　放開 = 轉回門鎖', 'HOLD VIEW = LOOK BACK · RELEASE = RETURN TO LOCK'],
      ['全部洩壓', 'VENT ALL'],
      ['時間不夠', 'RAN OUT OF TIME'],
      ['備用保險絲也熔斷了', 'THE SPARE FUSE BURNED OUT'],
      ['雙門閂已退回　·　拉下右側總閘桿', 'BOTH LATCHES RETRACTED · PULL THE MASTER LEVER'],
      ['防洪門已開　·　向前衝', 'FLOODGATE OPEN · RUN'],
      ['右側照明全滅 —— 牠已經抵達', 'THE RIGHT-SIDE LIGHTS DIED — IT HAS ARRIVED'],
      ['未完待續', 'TO BE CONTINUED'],
    ]);
    for (const [source, expected] of cases)
      expect(translatePlayerText(source)).toBe(expected);
  });

  it('translates the dynamic selected source tank cue', () => {
    expect(translatePlayerText('TANK 2 出口已開　·　選另一缸 ＋'))
      .toBe('TANK 2 OUTLET OPEN · SELECT ANOTHER TANK +');
  });

  it('leaves non-player or already-English text unchanged', () => {
    expect(translatePlayerText('LATCH-L · 6')).toBe('LATCH-L · 6');
    expect(translatePlayerText('')).toBe('');
  });

  it('installs English document metadata and initial player labels', () => {
    const nodes: Record<string, { textContent: string }> = {
      turnCue: { textContent: '按住畫面 = 回頭　·　放開 = 轉回門鎖' },
      dump: { textContent: '全部洩壓' },
      fade: { textContent: '未完待續' },
      halt: { textContent: '畫面中斷了　·　正在等待恢復' },
    };
    const document = {
      readyState: 'complete',
      documentElement: { lang: 'zh-Hant' },
      title: 'old',
      getElementById: (id: string) => nodes[id] ?? null,
      querySelector: (selector: string) => selector === '#fade div'
        ? nodes.fade : selector === '#halt p' ? nodes.halt : null,
    };
    const root = { document };

    expect(installEnglishPlayerUi(root as any)).toBe(true);
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('First Person Horror Lock Puzzle');
    expect(nodes.turnCue!.textContent).toContain('LOOK BACK');
    expect(nodes.dump!.textContent).toBe('VENT ALL');
    expect(nodes.fade!.textContent).toBe('TO BE CONTINUED');
    expect(nodes.halt!.textContent).toContain('RENDERING INTERRUPTED');
  });
});
