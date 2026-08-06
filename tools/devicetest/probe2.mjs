/* 第二輪：釐清面板高度異常 + 等 intro 真的結束後的實際互動 / 計時器 / 音訊 */
import { chromium, devices } from 'playwright';

const PAGE_URL = process.env.F0_URL || 'http://127.0.0.1:8100/f0.html';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

for (const p of [
  { name: 'iPhone-13-landscape', w: 844, h: 390, dpr: 3 },
  { name: 'MidAndroid-landscape', w: 780, h: 360, dpr: 2.75 },
  { name: 'iPhone-13-landscape@dpr1', w: 844, h: 390, dpr: 1 },
]) {
  const ctx = await browser.newContext({
    viewport: { width: p.w, height: p.h }, deviceScaleFactor: p.dpr,
    isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent,
  });
  const page = await ctx.newPage();
  await page.goto(PAGE_URL, { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  console.log(`\n──────── ${p.name} (${p.w}x${p.h} @${p.dpr}x) ────────`);

  /* A. 面板高度來源分析 */
  const layout = await page.evaluate(() => {
    const panel = document.getElementById('panel');
    const pins = document.getElementById('pins');
    const cut = document.getElementById('cut');
    const cs = getComputedStyle(panel);
    return {
      bodyH: document.body.clientHeight,
      panelH: panel.getBoundingClientRect().height,
      panelFlexBasis: cs.flexBasis, panelFlexShrink: cs.flexShrink, panelMinH: cs.minHeight,
      pinsH: pins.getBoundingClientRect().height,
      canvasAttrH: cut ? cut.height : null,
      canvasAttrW: cut ? cut.width : null,
      canvasCssH: cut ? cut.getBoundingClientRect().height : null,
      canvasStyleH: cut ? getComputedStyle(cut).height : null,
      viewH: document.getElementById('view').getBoundingClientRect().height,
    };
  });
  console.log('  面板高度分析:', JSON.stringify(layout, null, 2).replace(/\n/g, '\n  '));

  const expectBasis = p.h * 0.34;
  console.log(`  → flex-basis 34% 應為 ${expectBasis.toFixed(1)}px，實測 ${layout.panelH.toFixed(1)}px，` +
    `canvas 內建高度屬性 = ${layout.canvasAttrH}（= pins.clientHeight × min(dpr,2)）`);

  /* B. 縮小視窗高度看是否線性 —— 驗證是不是 canvas 內建尺寸在撐 */
  for (const hh of [300, 360, 420, 500]) {
    await page.setViewportSize({ width: p.w, height: hh });
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const pl = document.getElementById('panel').getBoundingClientRect().height;
      const cut = document.getElementById('cut');
      return { pl, ca: cut ? cut.height : null, pct: pl / document.body.clientHeight * 100 };
    });
    console.log(`  視窗高 ${hh} → panel ${r.pl.toFixed(0)}px (${r.pct.toFixed(1)}%), canvas.height=${r.ca}`);
  }
  await page.setViewportSize({ width: p.w, height: p.h });
  await page.waitForTimeout(300);

  /* C. 等 intro 真的結束 */
  let waited = 0, st = null;
  while (waited < 40000) {
    st = await page.evaluate(() => window.__probe());
    if (!st.intro) break;
    await page.waitForTimeout(500); waited += 500;
  }
  console.log(`  intro 結束耗時 ≈ ${(waited / 1000).toFixed(1)}s（設計值 2.2+1.3+0.95 = 4.45s）`);
  console.log(`  probe:`, JSON.stringify(st));

  /* D. 觸控推針 */
  const box = await page.locator('#pins').boundingBox();
  const before = await page.evaluate(() => window.__probe());
  // 由下往上滑 40px（門檻 20px）
  await page.touchscreen.tap(box.x + box.width * 0.3, box.y + box.height * 0.6);
  await page.waitForTimeout(400);
  const afterTap = await page.evaluate(() => window.__probe());
  console.log(`  單點推針: ${JSON.stringify(before.pins)} → ${JSON.stringify(afterTap.pins)}  progress ${before.progress}→${afterTap.progress}`);
  console.log(`  AudioContext state = ${afterTap.actx}`);

  /* E. 隱藏計時器 vs 背景 */
  const e1 = (await page.evaluate(() => window.__probe())).elapsed;
  await page.evaluate(() => { window.__pausedAt = performance.now(); });
  await page.waitForTimeout(3000);
  const e2 = (await page.evaluate(() => window.__probe())).elapsed;
  console.log(`  3 秒後 elapsed: ${e1.toFixed(2)} → ${e2.toFixed(2)}（差 ${(e2 - e1).toFixed(2)}s；限時 20s）`);

  /* F. 上方點一下 = 立刻回頭？ */
  const vbox = await page.locator('#view').boundingBox();
  await page.touchscreen.tap(vbox.x + vbox.width / 2, vbox.y + vbox.height / 2);
  await page.waitForTimeout(150);
  const y1 = (await page.evaluate(() => window.__probe())).yaw;
  await page.waitForTimeout(600);
  const y2 = (await page.evaluate(() => window.__probe())).yaw;
  console.log(`  上方單點（非長按）→ yaw ${y1.toFixed(1)}° → ${y2.toFixed(1)}°（tap 也會觸發回頭）`);

  await ctx.close();
}
await browser.close();
