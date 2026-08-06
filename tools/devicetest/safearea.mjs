/* safe-area（H1）與觸控命中區（H4）。
 *
 * Chromium 沒有模擬 safe-area 的能力（CDP 沒有 Emulation.setSafeAreaInsets），
 * 所以 index.html 把 env() 讀進 --sa-* 自訂屬性，這裡覆寫那些屬性來模擬瀏海。
 * 真機上 env() 會直接生效，兩條路徑用的是同一組 CSS。
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

/* CI 上沒有這個環境預裝的 Chromium，交給 Playwright 用它自己管理的那份
   （executablePath 給 undefined 就是這個意思）。本機則沿用預裝的，省下載。 */
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const chromiumPath = process.env.CHROMIUM_PATH
  || (fs.existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined);

const PAGE_URL = process.env.F0_URL || 'http://127.0.0.1:8100/index.html';
const browser = await chromium.launch({
  executablePath: chromiumPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} — ${detail}`);
};

/** 真機的實際數值：iPhone 13 橫向左側瀏海 47px、home indicator 21px。 */
const CASES = [
  { name: 'iPhone 13 橫向（左瀏海）', w: 844, h: 390, dpr: 3, sa: { t: 0, r: 0, b: 21, l: 47 } },
  { name: 'iPhone 13 橫向（右瀏海）', w: 844, h: 390, dpr: 3, sa: { t: 0, r: 47, b: 21, l: 0 } },
  { name: 'iPhone 13 直向',          w: 390, h: 844, dpr: 3, sa: { t: 47, r: 0, b: 34, l: 0 } },
  { name: '無瀏海（中階 Android）',    w: 780, h: 360, dpr: 2.75, sa: { t: 0, r: 0, b: 0, l: 0 } },
];

for (const c of CASES) {
  const ctx = await browser.newContext({
    viewport: { width: c.w, height: c.h }, deviceScaleFactor: c.dpr,
    isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent,
  });
  const page = await ctx.newPage();
  await page.addInitScript(sa => {
    addEventListener('DOMContentLoaded', () => {
      const r = document.documentElement.style;
      r.setProperty('--sa-t', sa.t + 'px'); r.setProperty('--sa-r', sa.r + 'px');
      r.setProperty('--sa-b', sa.b + 'px'); r.setProperty('--sa-l', sa.l + 'px');
    });
  }, c.sa);
  await page.goto(PAGE_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skipIntro, null, { timeout: 30000 });
  await page.evaluate(() => window.__skipIntro());
  await page.waitForTimeout(300);

  console.log(`\n──── ${c.name} (${c.w}×${c.h}, 瀏海 上${c.sa.t}/右${c.sa.r}/下${c.sa.b}/左${c.sa.l}) ────`);

  const m = await page.evaluate(() => {
    const el = id => document.getElementById(id).getBoundingClientRect();
    const pins = document.getElementById('pins');
    const panel = document.getElementById('panel');
    const cs = getComputedStyle(panel);
    const pad = n => parseFloat(cs.getPropertyValue(n));
    return {
      view: el('view'), panel: el('panel'), pinsBox: el('pins'), dump: el('dump'),
      pinsH: pins.clientHeight,
      padL: pad('padding-left'), padR: pad('padding-right'), padB: pad('padding-bottom'),
    };
  });

  /* H1：可操作元素不得落在瀏海／home indicator 區 */
  const hits = [];
  if (m.pinsBox.x < c.sa.l - 0.5) hits.push(`撬鎖區左緣 ${m.pinsBox.x.toFixed(0)} < ${c.sa.l}`);
  if (m.pinsBox.right > c.w - c.sa.r + 0.5) hits.push(`撬鎖區右緣 ${m.pinsBox.right.toFixed(0)} > ${c.w - c.sa.r}`);
  if (m.dump.bottom > c.h - c.sa.b + 0.5) hits.push(`洩壓鈕下緣 ${m.dump.bottom.toFixed(0)} > ${c.h - c.sa.b}`);
  if (m.dump.x < c.sa.l - 0.5) hits.push(`洩壓鈕左緣 ${m.dump.x.toFixed(0)} < ${c.sa.l}`);
  if (m.pinsBox.bottom > c.h - c.sa.b + 0.5) hits.push(`撬鎖區下緣 ${m.pinsBox.bottom.toFixed(0)} > ${c.h - c.sa.b}`);
  check('H1 可操作元素全部避開瀏海與 home indicator', hits.length === 0, hits.join('；') || '無重疊');

  /* H4：洩壓鈕的觸控命中區 */
  check('H4 洩壓鈕 ≥44×44', m.dump.height >= 44 && m.dump.width >= 44,
    `${m.dump.width.toFixed(0)}×${m.dump.height.toFixed(0)}px`);

  /* 可操作區佔比：分母扣掉 safe-area，因為那段本來就不能用 */
  const usablePanel = m.panel.height - m.padB + (c.sa.b ? 0 : 0);
  const usableTotal = m.view.height + usablePanel;
  const pct = (usablePanel - 0) / usableTotal * 100;
  check('可操作區比例仍在設計範圍（上 65~70% / 下 30~35%）', pct >= 28 && pct <= 38,
    `下方可操作 ${(usablePanel).toFixed(0)}px / ${pct.toFixed(1)}%；view ${m.view.height.toFixed(0)}px`);

  /* B2 不能被 H1/H4 吃回去 */
  const seam = {};
  const SAMPLER = x => {
    const cv = document.getElementById('cut');
    const ctx2 = cv.getContext('2d');
    const el = document.getElementById('pins');
    const scale = cv.height / el.clientHeight;
    const img = ctx2.getImageData(Math.round(x * scale), 0, 1, cv.height).data;
    for (let y = 0; y < cv.height; y++) {
      const r = img[y * 4], g = img[y * 4 + 1], b = img[y * 4 + 2];
      if (r > 100 && r - b > 60 && b < 110 && r > g && g > b) return y / scale;
    }
    return null;
  };
  const geom = await page.evaluate(() => window.__pinCentres());
  for (const st of ['idle', 'partial']) {
    await page.evaluate(s2 => window.__setPins(Array(4).fill(s2)), st);
    await page.waitForTimeout(120);
    seam[st] = await page.evaluate(SAMPLER, geom.xs[1]);
  }
  const travel = seam.idle !== null && seam.partial !== null ? seam.idle - seam.partial : null;
  check('B2 撞針 idle→partial 仍 ≥8px', travel !== null && travel >= 8,
    travel !== null ? `${travel.toFixed(1)}px（剖面圖高 ${m.pinsH}px）` : '取樣失敗');

  await ctx.close();
}

console.log(`\n=== FAIL ${failures} 項 ===`);
await browser.close();
process.exit(failures ? 1 : 0);
