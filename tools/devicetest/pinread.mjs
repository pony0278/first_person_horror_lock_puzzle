/* 撞針高度可讀性：把撞針逐一設成各種狀態，直接從畫好的 canvas 取樣，
   量出「鋼製驅動栓 / 銅製鑰匙栓」交界（也就是接縫 seam）的實際 y。
   刻意不複製 drawCutaway 的公式 —— 讀畫面才是玩家看到的東西。 */
import { chromium, devices } from 'playwright';

const PAGE_URL = process.env.F0_URL || 'http://127.0.0.1:8100/f0.html';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const CASES = [
  { name: 'iPhone13 橫向',    w: 844,  h: 390,  dpr: 3 },
  { name: '中階Android 橫向', w: 780,  h: 360,  dpr: 2.75 },
  { name: 'iPhone SE 橫向',   w: 667,  h: 375,  dpr: 2 },
  { name: 'iPhone13 直向',    w: 390,  h: 844,  dpr: 3 },
  { name: '桌機 1080p',       w: 1920, h: 1080, dpr: 1 },
];
const STATES = ['idle', 'partial', 'set', 'falseSet'];

/* 從 canvas 取一條垂直掃描線，找銅色（鑰匙栓）的最上緣 = 接縫 y */
const SAMPLER = (x) => {
  const cv = document.getElementById('cut');
  const ctx = cv.getContext('2d');
  const el = document.getElementById('pins');
  const scale = cv.height / el.clientHeight;          // 裝置像素 / CSS 像素
  const px = Math.round(x * scale);
  const img = ctx.getImageData(px, 0, 1, cv.height).data;
  for (let y = 0; y < cv.height; y++) {
    const r = img[y * 4], g = img[y * 4 + 1], b = img[y * 4 + 2];
    // 銅栓 #997a3d / #b5924c。b<110 是為了排開剪切線高亮 #c8b98f（b=143），
    // 它在 set 狀態下正好畫在同一條 y 上，會蓋過真正的接縫。
    if (r > 100 && r - b > 60 && b < 110 && r > g && g > b) return y / scale;
  }
  return null;
};

for (const c of CASES) {
  const ctx = await browser.newContext({
    viewport: { width: c.w, height: c.h }, deviceScaleFactor: c.dpr,
    isMobile: c.dpr > 1, hasTouch: c.dpr > 1, userAgent: devices['iPhone 13'].userAgent,
  });
  const page = await ctx.newPage();
  await page.goto(PAGE_URL, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const geom = await page.evaluate(() => window.__pinCentres());
  const seam = {};
  for (const st of STATES) {
    await page.evaluate(s => window.__setPins(Array(4).fill(s)), st);
    await page.waitForTimeout(120);
    seam[st] = await page.evaluate(SAMPLER, geom.xs[1]);
  }

  console.log(`\n── ${c.name} (${c.w}×${c.h} @${c.dpr}x) — #pins 高 ${geom.h}px`);
  if (Object.values(seam).some(v => v == null)) {
    console.log('   取樣失敗（找不到銅色栓）:', JSON.stringify(seam));
    await ctx.close(); continue;
  }
  const d = {
    'idle → partial（推錯，頂到 40%）': seam.idle - seam.partial,
    'idle → set（固定）':               seam.idle - seam.set,
    'partial → set':                   seam.partial - seam.set,
    'set → falseSet（假針）':           seam.set - seam.falseSet,
  };
  for (const [k, v] of Object.entries(d)) {
    const flag = v < 4 ? '  ⚠ 幾乎看不出來' : v < 8 ? '  ⚠ 偏小' : '';
    console.log(`     ${k.padEnd(30)} ${v.toFixed(1)} CSS px${flag}`);
  }
  await ctx.close();
}
await browser.close();
