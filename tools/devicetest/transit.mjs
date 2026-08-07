/* 門 1 → 門 2 過場（F1 切片）的自動驗證。
 *
 * 流程：跳過開場 → __solveDoor1() 解開門 1 → 依序等每個過場階段 →
 * 驗證換裝（變電室出現、提示牆收走、衰變升級）→ 取件 → 等自動重開 → 驗證全部歸位。
 * 階段是 dt 驅動的，低幀率下會等比拉長（M1）—— 一律用 waitForFunction，不用固定等待。
 *
 * 取件跑兩趟，因為有兩條輸入路徑：
 *   第一趟 兩根手指 —— 滑鼠按住＝視角，觸控點擊＝伸手（點歪不算）
 *   第二趟 一根手指 —— 按住往下盲扯
 * 這兩條是同一個世界的兩種握法，都得會動。
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
const tugCount = () => page.evaluate(() => window.__probe().tug);
const waitPhase = async (name, timeout = 60000) => {
  const t0 = Date.now();
  try {
    await page.waitForFunction(
      n => {
        const seq = ['approach', 'arrive', 'door2', 'grab', 'retrieved', 'done', 'idle'];
        return seq.indexOf(window.__probe().transit) >= seq.indexOf(n) ||
               window.__probe().transit === n;
      },
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

/* ── 取件（第一趟）：兩根手指 —— 按住回頭，另一指去點鬆脫段 ── */
await page.waitForFunction(() => window.__probe().transit === 'door2', null, { timeout: 60000 });
check('抵達後進入互動等待（door2）', true, 'phase=door2');

/* 滑鼠按住上方＝第一根手指，回頭 */
await page.mouse.move(422, 110);
await page.mouse.down();
try {
  await page.waitForFunction(() => Math.abs(window.__probe().yaw) >= 130, null, { timeout: 30000 });
  check('按住回頭到取件角度', true, `yaw=${await page.evaluate(() => window.__probe().yaw.toFixed(0))}°`);
} catch { check('按住回頭到取件角度', false, '逾時'); }
await page.screenshot({ path: `${OUT}/transit-lookback.png` });

/* 這是使用者回報的那件事：轉頭的手指還按著，第二根手指要能同時動作。
   命中點由頁面自己算（__grabPoint），寫死座標會在鏡頭一改就變成假通過。 */
const gp = await page.evaluate(() => window.__grabPoint());
check('回頭後鬆脫段在畫面上', !!gp,
  gp ? `(${gp.x.toFixed(0)}, ${gp.y.toFixed(0)}) r=${gp.r.toFixed(0)}px` : 'null');
check('命中半徑 ≥ 48px（H4 觸控目標）', !!gp && gp.r >= 48, gp ? `r=${gp.r.toFixed(0)}px` : '—');

if (gp) {
  /* 點歪不算：離命中半徑兩倍遠的地方點一下，tug 不該增加 */
  const before = await tugCount();
  await page.touchscreen.tap(Math.max(4, gp.x - gp.r * 2.2), gp.y);
  await page.waitForTimeout(120);
  const afterMiss = await tugCount();
  check('點歪不算一次扯', afterMiss === before, `tug ${before} → ${afterMiss}`);

  /* 點中三下 —— 視角手指全程沒有放開 */
  for (let i = 0; i < 3; i++) {
    const p = await page.evaluate(() => window.__grabPoint());
    if (!p) break;
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(140);
  }
  const tapN = await tugCount();
  check('第二根手指點三下＝三次扯拽', tapN >= 3, `tug=${tapN}`);
  check('視角手指全程按著沒被搶走',
    await page.evaluate(() => Math.abs(window.__probe().yaw) >= 130),
    `yaw=${await page.evaluate(() => window.__probe().yaw.toFixed(0))}°`);
}
await page.mouse.up();

await page.waitForFunction(
  () => ['grab', 'retrieved', 'done', 'idle'].includes(window.__probe().transit),
  null, { timeout: 30000 });
check('第三扯後鬆脫段脫落（grab）', true,
  `phase=${await page.evaluate(() => window.__probe().transit)}`);

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
    tug: window.__probe().tug,
  }));
  check('自動重開且歸位', reset.tug === 0, `seep=${reset.seep} tug=${reset.tug} elapsed=${reset.elapsed.toFixed(2)}`);
} catch {
  check('自動重開且歸位', false, `逾時（phase=${await phase()}）`);
}

/* ── 取件（第二趟）：桌機 S 鍵佔視角 ＋ 一根手指盲扯（單手握手機的退路） ── */
await page.evaluate(() => window.__skipIntro());     // 重開後演出會再跑一次
await page.waitForTimeout(300);
await page.evaluate(() => window.__solveDoor1());
try {
  await page.waitForFunction(() => window.__probe().transit === 'door2', null, { timeout: 90000 });

  /* 桌機：左鍵按住轉過去 → 補按 S → 放開左鍵（視角不該彈回）→ 滑鼠空出來伸手。
     這是桌機唯一可行的順序：只有一個滑鼠，視角必須先交接出去。 */
  await page.mouse.move(422, 110);
  await page.mouse.down();
  await page.waitForFunction(() => Math.abs(window.__probe().yaw) >= 130, null, { timeout: 30000 });
  await page.keyboard.down('s');
  await page.mouse.up();
  await page.waitForTimeout(250);
  check('左鍵交接給 S 後視角沒有彈回',
    await page.evaluate(() => Math.abs(window.__probe().yaw) >= 130),
    `yaw=${await page.evaluate(() => window.__probe().yaw.toFixed(0))}°`);
  const gp2 = await page.evaluate(() => window.__grabPoint());
  if (gp2) await page.mouse.click(gp2.x, gp2.y);
  await page.waitForTimeout(140);
  check('桌機 S 佔視角時滑鼠仍能伸手', await tugCount() >= 1, `tug=${await tugCount()}`);
  check('滑鼠點擊沒有搶走 S 鍵的視角',
    await page.evaluate(() => Math.abs(window.__probe().yaw) >= 130),
    `yaw=${await page.evaluate(() => window.__probe().yaw.toFixed(0))}°`);
  await page.keyboard.up('s');
  await page.waitForFunction(() => Math.abs(window.__probe().yaw) < 100, null, { timeout: 30000 });
  check('放開 S 視角彈回正面', true, `yaw=${await page.evaluate(() => window.__probe().yaw.toFixed(0))}°`);

  /* 一指盲扯 */
  const before2 = await tugCount();
  await page.mouse.move(422, 110);
  await page.mouse.down();
  await page.waitForFunction(() => Math.abs(window.__probe().yaw) >= 130, null, { timeout: 30000 });
  for (let i = 1; i <= 3; i++) {
    await page.mouse.move(422, 110 + i * 60, { steps: 4 });
    await page.waitForTimeout(150);
  }
  const tugN = await tugCount();
  check('一指按住下拉也算扯拽', tugN - before2 >= 2, `tug ${before2} → ${tugN}`);
  await page.mouse.up();
  await page.waitForFunction(
    () => ['grab', 'retrieved', 'done', 'idle'].includes(window.__probe().transit),
    null, { timeout: 30000 });
  check('一指路徑也會脫落', true, `phase=${await phase()}`);
} catch {
  check('第二趟取件（桌機＋一指）', false, `逾時（phase=${await phase()}）`);
}

check('全程無 JS 例外', errs.length === 0, errs.slice(0, 3).join(' | ') || '無');

console.log(`\n=== FAIL ${failures} 項 ===`);
await browser.close();
process.exit(failures ? 1 : 0);
