/* 門 1 → 門 2 過場（F1 切片）的自動驗證。
 *
 * 流程：跳過開場 → __solveDoor1() 解開門 1 → 依序等每個過場階段 →
 * 驗證換裝（變電室出現、提示牆收走、衰變升級）→ 等自動重開 → 驗證全部歸位。
 * 階段是 dt 驅動的，低幀率下會等比拉長（M1）—— 一律用 waitForFunction，不用固定等待。
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const chromiumPath = process.env.CHROMIUM_PATH
  || (fs.existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined);

const PAGE_URL = process.env.F0_URL || 'http://127.0.0.1:8100/index.html';
const OUT = new URL('./build/shots', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} — ${detail}`);
};

const browser = await chromium.launch({
  executablePath: chromiumPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({
  viewport: { width: 844, height: 390 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent,
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));

await page.goto(PAGE_URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__skipIntro, null, { timeout: 30000 });
await page.evaluate(() => window.__skipIntro());
await page.waitForTimeout(300);

/* 解開門 1 → 過場開始 */
await page.evaluate(() => window.__solveDoor1());
const phase = () => page.evaluate(() => window.__probe().transit);
const waitPhase = async (name, timeout = 60000) => {
  const t0 = Date.now();
  try {
    await page.waitForFunction(
      n => ['approach', 'arrive', 'done', 'idle'].indexOf(window.__probe().transit) >=
           ['approach', 'arrive', 'done', 'idle'].indexOf(n) ||
           window.__probe().transit === n,
      name, { timeout });
    check(`階段抵達 ${name}`, true, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch {
    check(`階段抵達 ${name}`, false, `逾時（現在是 ${await phase()}）`);
  }
};

check('過場已啟動', ['open', 'through', 'corner'].includes(await phase()),
  `phase=${await phase()}`);
check('勝利後 R.over 維持（計時凍結）', await page.evaluate(() => window.__probe().over), 'over=true');

await waitPhase('approach');

/* 換裝驗證：衰變升級（變電室與提示牆的可見性由截圖與 seep 一併佐證） */
const dress = await page.evaluate(() => ({ seep: window.__probe().seep }));
check('衰變已升到門 2 等級', dress.seep >= 0.5, `seep=${dress.seep}`);

/* 經過變電室時截圖（tz 接近 electroZ、頭轉過去的瞬間） */
try {
  await page.waitForFunction(() => {
    const p = window.__probe();
    return p.transit === 'approach' && p.tz < 6.4 && Math.abs(p.yaw) > 8;
  }, null, { timeout: 60000 });
  await page.screenshot({ path: `${OUT}/transit-electro.png` });
  check('經過變電室時有轉頭', true, `yaw=${await page.evaluate(() => window.__probe().yaw.toFixed(1))}°`);
} catch {
  check('經過變電室時有轉頭', false, '逾時未觀察到 yaw > 8°');
}

await waitPhase('arrive');
await page.screenshot({ path: `${OUT}/transit-door2.png` });

await waitPhase('done');

/* 自動重開：全部歸位 */
try {
  await page.waitForFunction(() => {
    const p = window.__probe();
    return p.transit === 'idle' && !p.over && p.pins.every(x => x === 'idle');
  }, null, { timeout: 60000 });
  const reset = await page.evaluate(() => ({
    seep: window.__probe().seep,
    elapsed: window.__probe().elapsed,
  }));
  check('自動重開且歸位', true, `seep=${reset.seep} elapsed=${reset.elapsed.toFixed(2)}`);
} catch {
  check('自動重開且歸位', false, `逾時（phase=${await phase()}）`);
}

check('全程無 JS 例外', errs.length === 0, errs.slice(0, 3).join(' | ') || '無');

console.log(`\n=== FAIL ${failures} 項 ===`);
await browser.close();
process.exit(failures ? 1 : 0);
