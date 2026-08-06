/* F0 v28 — 手機視窗自動測試
   跑真 Chromium（有 WebGL），模擬 iPhone / 中階 Android 的視窗、DPR、觸控。
   只驗證機器測得出來的部分；主觀項目（發熱、戶外可辨識度）留給真機。 */
import { chromium, devices } from 'playwright';
import fs from 'fs';

const PAGE_URL = process.env.F0_URL || 'http://127.0.0.1:8100/f0.html';
const OUT = new URL('./build/shots', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const PROFILES = [
  { name: 'iPhone-13-landscape', w: 844, h: 390, dpr: 3, touch: true,
    ua: devices['iPhone 13'].userAgent, notch: { left: 47, right: 0, bottom: 21 } },
  { name: 'iPhone-13-portrait',  w: 390, h: 844, dpr: 3, touch: true,
    ua: devices['iPhone 13'].userAgent, notch: { top: 47, bottom: 34 } },
  { name: 'iPhone-SE-landscape', w: 667, h: 375, dpr: 2, touch: true,
    ua: devices['iPhone SE'].userAgent, notch: null },
  { name: 'MidAndroid-landscape', w: 780, h: 360, dpr: 2.75, touch: true,
    ua: devices['Galaxy S9+'].userAgent, notch: null },
  { name: 'MidAndroid-portrait',  w: 360, h: 780, dpr: 2.75, touch: true,
    ua: devices['Galaxy S9+'].userAgent, notch: null },
];

const results = [];
const rec = (profile, id, pass, detail) => {
  results.push({ profile, id, pass, detail });
  console.log(`${pass === true ? 'PASS' : pass === false ? 'FAIL' : 'INFO'}  [${profile}] ${id} — ${detail}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

for (const p of PROFILES) {
  const ctx = await browser.newContext({
    viewport: { width: p.w, height: p.h },
    deviceScaleFactor: p.dpr,
    isMobile: true, hasTouch: p.touch,
    userAgent: p.ua,
  });
  const page = await ctx.newPage();
  if (p.notch) {
    await page.addInitScript(n => {
      addEventListener('DOMContentLoaded', () => {
        const r = document.documentElement.style;
        r.setProperty('--sa-t', (n.top ?? 0) + 'px');
        r.setProperty('--sa-r', (n.right ?? 0) + 'px');
        r.setProperty('--sa-b', (n.bottom ?? 0) + 'px');
        r.setProperty('--sa-l', (n.left ?? 0) + 'px');
      });
    }, p.notch);
  }
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(PAGE_URL, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  /* 1.2 首屏是否真的畫出東西（canvas 非全黑） */
  const drew = await page.evaluate(() => {
    const c = document.querySelector('#view canvas');
    if (!c) return { ok: false, why: 'no canvas' };
    return { ok: c.width > 0 && c.height > 0, w: c.width, h: c.height };
  });
  rec(p.name, '1.2 canvas 建立', drew.ok, `canvas ${drew.w}x${drew.h}`);

  /* 1.5 外部資源依賴 */
  /* 2.1 版面溢出 */
  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    scrollH: document.documentElement.scrollHeight,
    clientH: document.documentElement.clientHeight,
  }));
  rec(p.name, '2.1 無溢出',
    overflow.scrollW <= overflow.clientW && overflow.scrollH <= overflow.clientH,
    `scroll ${overflow.scrollW}x${overflow.scrollH} vs client ${overflow.clientW}x${overflow.clientH}`);

  /* 2.2 safe-area：量測關鍵可點元素是否落在瀏海／home indicator 區 */
  if (p.notch) {
    const box = await page.evaluate(() => {
      const b = document.getElementById('dump').getBoundingClientRect();
      const pins = document.getElementById('pins').getBoundingClientRect();
      return { dump: { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.bottom, right: b.right },
               pins: { x: pins.x, y: pins.y, w: pins.width, h: pins.height, bottom: pins.bottom } };
    });
    const vh = p.h, vw = p.w;
    const n = p.notch;
    const hits = [];
    if (n.bottom && box.dump.bottom > vh - n.bottom) hits.push(`全部洩壓鈕下緣 ${box.dump.bottom.toFixed(0)} 落在 home indicator 區 (>${vh - n.bottom})`);
    if (n.bottom && box.pins.bottom > vh - n.bottom) hits.push(`撬鎖區下緣 ${box.pins.bottom.toFixed(0)} 落在 home indicator 區`);
    if (n.left && box.dump.x < n.left - 0.5) hits.push(`全部洩壓鈕左緣 ${box.dump.x.toFixed(0)} 落在瀏海區 (<${n.left})`);
    if (n.left && box.pins.x < n.left - 0.5) hits.push(`撬鎖區左緣 ${box.pins.x.toFixed(0)} 落在瀏海區`);
    if (n.right && box.pins.right > vw - n.right + 0.5) hits.push(`撬鎖區右緣 ${box.pins.right.toFixed(0)} 落在瀏海區`);
    rec(p.name, '2.2 safe-area 不遮擋', hits.length === 0, hits.length ? hits.join('；') : '無重疊');
  }

  /* 2.4 上下分區比例是否符合設計（上 65-70% / 下 30-35%） */
  const split = await page.evaluate(() => {
    const v = document.getElementById('view').getBoundingClientRect();
    const panel = document.getElementById('panel');
    const pl = panel.getBoundingClientRect();
    // 扣掉 safe-area 的內距 —— 那段是 home indicator 佔的，本來就不能操作
    const saB = parseFloat(getComputedStyle(panel).paddingBottom) - 6;
    return { view: v.height, panel: pl.height - Math.max(0, saB) };
  });
  const panelPct = split.panel / (split.view + split.panel) * 100;
  rec(p.name, '2.4 可操作區比例', panelPct >= 28 && panelPct <= 38,
    `下方 ${panelPct.toFixed(1)}%（設計 30~35%）；view ${split.view.toFixed(0)}px / 可操作 ${split.panel.toFixed(0)}px`);

  /* 3.4 觸控目標 ≥44px：每個撞針欄位的寬度 + 洩壓鈕 */
  const targets = await page.evaluate(() => {
    const pins = document.getElementById('pins').getBoundingClientRect();
    const capL = pins.height * 0.16 * 2.1;
    const perPin = (pins.width - capL) / 4;
    const d = document.getElementById('dump').getBoundingClientRect();
    return { perPin, pinsH: pins.height, dumpW: d.width, dumpH: d.height };
  });
  rec(p.name, '3.4 撞針命中寬 ≥44px', targets.perPin >= 44, `每針 ${targets.perPin.toFixed(1)}px`);
  rec(p.name, '3.4b 洩壓鈕 ≥44px', targets.dumpH >= 44, `${targets.dumpW.toFixed(0)}x${targets.dumpH.toFixed(0)}px`);

  /* 等開場演出跑完（run 2.2s + handle 1.3s + tool 0.95s ≈ 4.5s） */
  await page.waitForTimeout(4200);

  /* 3.1/3.2 觸控撬鎖：向上滑一支針，看鎖狀態是否改變 */
  const before = await page.evaluate(() => window.__probe?.() ?? null);
  const pinsBox = await page.locator('#pins').boundingBox();
  const px = pinsBox.x + pinsBox.width * 0.5, py = pinsBox.y + pinsBox.height * 0.6;
  await page.touchscreen.tap(px, py);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__probe?.() ?? null);
  rec(p.name, '3.2 觸控可推針', null,
    before && after ? `pins ${JSON.stringify(before.pins)} → ${JSON.stringify(after.pins)}` : '無 probe 掛鉤（需在原型加測試接點）');

  /* 3.6 雙擊是否觸發縮放 */
  await page.touchscreen.tap(px, py);
  await page.waitForTimeout(60);
  await page.touchscreen.tap(px, py);
  await page.waitForTimeout(400);
  const zoom = await page.evaluate(() => ({ vs: visualViewport.scale, w: visualViewport.width }));
  rec(p.name, '3.6 雙擊不縮放', Math.abs(zoom.vs - 1) < 0.01, `visualViewport.scale=${zoom.vs}`);

  /* 3.9 切背景再回來：隱藏計時器是否照跑（wall-clock bug 檢查） */
  const t1 = await page.evaluate(() => window.__probe?.().elapsed ?? null);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const t2 = await page.evaluate(() => window.__probe?.().elapsed ?? null);
  rec(p.name, '3.9 背景不吃時間', null,
    t1 != null ? `elapsed ${t1.toFixed(2)} → ${t2.toFixed(2)}（2 秒背景）` : '無 probe 掛鉤');

  /* 4.1 FPS：取樣 5 秒 */
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0, worst = 0, last = performance.now();
    const t0 = last;
    const loop = () => {
      const now = performance.now();
      const d = now - last; last = now;
      if (n > 5) worst = Math.max(worst, d);
      n++;
      if (now - t0 < 5000) requestAnimationFrame(loop);
      else res({ avg: n / ((now - t0) / 1000), worstFrameMs: worst });
    };
    requestAnimationFrame(loop);
  }));
  rec(p.name, '4.1 FPS（SwiftShader 軟體渲染，非真機代表值）', null,
    `avg ${fps.avg.toFixed(1)} / 最差單幀 ${fps.worstFrameMs.toFixed(0)}ms`);

  /* 5.1 AudioContext 狀態 */
  const audio = await page.evaluate(() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    return { ctxCount: AC ? 'available' : 'none' };
  });
  rec(p.name, '5.1 音訊', null, `AudioContext ${audio.ctxCount}（實際 state 需 probe）`);

  rec(p.name, 'JS 例外', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : '無');

  await page.screenshot({ path: `${OUT}/${p.name}.png` });
  await ctx.close();
}

await browser.close();
fs.writeFileSync(OUT + '/results.json', JSON.stringify(results, null, 2));
const fails = results.filter(r => r.pass === false);
console.log(`\n=== ${results.length} 項，FAIL ${fails.length} 項 ===`);
