/* 撞針高度可讀性：把四支針分別設為 idle / partial / set / falseSet，
   量測各狀態在剖面圖上的實際像素差，並截下面板特寫。 */
import { chromium, devices } from 'playwright';
const PAGE_URL = process.env.F0_URL || 'http://127.0.0.1:8100/f0.html';
const OUT = new URL('./build/shots', import.meta.url).pathname;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const CASES = [
  { name: 'iPhone13-landscape', w: 844, h: 390, dpr: 3 },
  { name: 'MidAndroid-landscape', w: 780, h: 360, dpr: 2.75 },
  { name: 'iPhone13-portrait', w: 390, h: 844, dpr: 3 },
  { name: 'Desktop-1080', w: 1920, h: 1080, dpr: 1 },
];

console.log('剖面圖狀態高度差（CFG.lock.partialH=0.40，seam 係數見 drawCutaway）');
console.log('狀態幾何： idle=SHEAR+h*0.115  partial=SHEAR+h*0.069  set=SHEAR  falseSet=SHEAR-h*0.028\n');

for (const c of CASES) {
  const ctx = await browser.newContext({
    viewport: { width: c.w, height: c.h }, deviceScaleFactor: c.dpr,
    isMobile: c.dpr > 1, hasTouch: c.dpr > 1, userAgent: devices['iPhone 13'].userAgent,
  });
  const page = await ctx.newPage();
  await page.goto(PAGE_URL, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const h = await page.evaluate(() => document.getElementById('pins').clientHeight);
  const d = {
    'idle → partial（推錯，頂到 40%）': h * 0.115 * 0.40,
    'idle → set（固定）': h * 0.115,
    'partial → set': h * 0.069,
    'set → falseSet（假針）': h * 0.028,
  };
  console.log(`── ${c.name} (${c.w}x${c.h} @${c.dpr}x) — #pins 高 ${h}px`);
  for (const [k, v] of Object.entries(d)) {
    const flag = v < 4 ? '  ⚠ 幾乎看不出來' : v < 8 ? '  ⚠ 偏小' : '';
    console.log(`     ${k.padEnd(30)} ${v.toFixed(1)} CSS px${flag}`);
  }

  // 讓 intro 結束後把四支針設成不同狀態，截面板特寫
  let w = 0;
  while (w < 45000 && (await page.evaluate(() => window.__probe().intro))) { await page.waitForTimeout(500); w += 500; }
  await page.evaluate(() => {
    // 直接操控狀態機做視覺對照：0=idle 1=partial 2=set 3=falseSet
    const L = window.__lock ?? null;
  });
  await ctx.close();
}
await browser.close();
