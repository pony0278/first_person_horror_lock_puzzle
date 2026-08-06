/* 中斷情境：切到背景（H2）與 WebGL context 遺失（H3）。
   兩者都必須讓隱藏計時器停下來 —— 玩家不該在看不見畫面的時候被殺掉。 */
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

const ctx = await browser.newContext({
  viewport: { width: 844, height: 390 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent,
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.goto(PAGE_URL, { waitUntil: 'load' });

/* 等開場演出結束，計時器才真的在跑 */
let waited = 0;
while (waited < 60000 && (await page.evaluate(() => window.__probe().intro))) {
  await page.waitForTimeout(500); waited += 500;
}
await page.waitForTimeout(600);

const elapsed = () => page.evaluate(() => window.__probe().elapsed);
const haltShown = () => page.evaluate(() => {
  const h = document.getElementById('halt');
  return { on: h.classList.contains('on'), text: h.querySelector('p').textContent };
});
const panelBlind = () => page.evaluate(() =>
  document.getElementById('panel').classList.contains('blind'));

const setHidden = v => page.evaluate(hidden => {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  Object.defineProperty(document, 'visibilityState',
    { value: hidden ? 'hidden' : 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}, v);

/* ── H2：切到背景 ── */
console.log('\n──── H2 切到背景 ────');
const a0 = await elapsed();
await setHidden(true);
await page.waitForTimeout(3000);
const a1 = await elapsed();
check('背景 3 秒不吃時間', Math.abs(a1 - a0) < 0.3, `elapsed ${a0.toFixed(2)} → ${a1.toFixed(2)}`);
check('背景期間下方停止接受輸入', await panelBlind(), 'panel.blind');
const hb = await haltShown();
check('背景不蓋提示畫面（玩家本來就沒在看）', !hb.on, `halt.on=${hb.on}`);

await setHidden(false);
await page.waitForTimeout(1500);
const a2 = await elapsed();
check('回到前景後計時器繼續走', a2 - a1 > 1.0, `elapsed ${a1.toFixed(2)} → ${a2.toFixed(2)}`);
check('回到前景後恢復輸入', !(await panelBlind()), 'panel.blind 已解除');

/* ── H3：WebGL context 遺失與恢復 ── */
console.log('\n──── H3 WebGL context 遺失 ────');
/* 在頁面內側錄「事件觸發那一刻」的 elapsed。
   不能從外面前後夾量 —— loseContext() 到 webglcontextlost 之間有瀏覽器自己的
   派送延遲（本環境實測 260~330ms，約 6~7 幀），那段時間遊戲還不知道畫面掉了，
   量進去會把瀏覽器的延遲算成我們的漏秒。 */
await page.evaluate(() => {
  const c = document.querySelector('#view canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  window.__ext = gl.getExtension('WEBGL_lose_context');
  window.__lossT0 = performance.now();
  c.addEventListener('webglcontextlost', () => {
    window.__atLoss = { elapsed: window.__probe().elapsed, delayMs: performance.now() - window.__lossT0 };
  }, { once: true });
  window.__ext.loseContext();
});
await page.waitForTimeout(2500);
const atLoss = await page.evaluate(() => window.__atLoss ?? null);
const b1 = await elapsed();
const hc = await haltShown();
check('事件觸發後不再吃時間', atLoss !== null && Math.abs(b1 - atLoss.elapsed) < 0.15,
  atLoss ? `事件當下 ${atLoss.elapsed.toFixed(2)} → 2.5 秒後 ${b1.toFixed(2)}` : '事件未觸發');
console.log(`  INFO  瀏覽器派送 webglcontextlost 的延遲: ${atLoss ? atLoss.delayMs.toFixed(0) : '-'}ms` +
  `（這段期間遊戲還不知情，無法避免）`);
check('遺失期間有蓋提示畫面', hc.on && hc.text.length > 0, `「${hc.text}」`);
check('遺失期間停止接受輸入', await panelBlind(), 'panel.blind');

await page.evaluate(() => window.__ext.restoreContext());
await page.waitForTimeout(3000);
const b2 = await elapsed();
const hd = await haltShown();
check('恢復後提示畫面收起', !hd.on, `halt.on=${hd.on}`);
check('恢復後計時器繼續走', b2 - b1 > 1.0, `elapsed ${b1.toFixed(2)} → ${b2.toFixed(2)}`);
check('恢復後畫面有回來', (await page.locator('#view').screenshot()).length > 20000,
  `截圖 ${(await page.locator('#view').screenshot()).length}B`);

/* ── 兩者疊加：先背景、再遺失，一個先恢復不能放行計時器 ── */
console.log('\n──── H2 + H3 疊加 ────');
await page.evaluate(() => {
  window.__atLoss2 = null;
  document.querySelector('#view canvas').addEventListener('webglcontextlost',
    () => { window.__atLoss2 = window.__probe().elapsed; }, { once: true });
});
await setHidden(true);
await page.evaluate(() => window.__ext.loseContext());
await page.waitForTimeout(2000);
const c0 = await page.evaluate(() => window.__atLoss2 ?? window.__probe().elapsed);
await setHidden(false);                       // 回到前景，但畫面還沒回來
await page.waitForTimeout(2500);
const c1 = await elapsed();
check('只恢復其中一項時計時器仍停著', Math.abs(c1 - c0) < 0.4,
  `elapsed ${c0.toFixed(2)} → ${c1.toFixed(2)}`);
check('仍蓋著 context 遺失的提示', (await haltShown()).on, 'halt.on');

await page.evaluate(() => window.__ext.restoreContext());
await page.waitForTimeout(2500);
const c2 = await elapsed();
check('兩項都恢復後計時器才繼續', c2 - c1 > 1.0, `elapsed ${c1.toFixed(2)} → ${c2.toFixed(2)}`);

console.log(`\nJS 例外: ${errs.length ? errs.slice(0, 3).join(' | ') : '無'}`);
console.log(`\n=== FAIL ${failures} 項 ===`);
await browser.close();
process.exit(failures ? 1 : 0);
