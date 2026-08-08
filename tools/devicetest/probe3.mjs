/* 第三輪：音訊自動播放政策 + WebGL context loss + 面板高度修正驗證 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/* CI 上沒有這個環境預裝的 Chromium，交給 Playwright 用它自己管理的那份
   （executablePath 給 undefined 就是這個意思）。本機則沿用預裝的，省下載。 */
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const chromiumPath = process.env.CHROMIUM_PATH
  || (fs.existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined);

const PAGE_URL = process.env.F0_URL || 'http://127.0.0.1:8100/f0.html';

/* A. 開啟真實的自動播放限制（等同 iOS Safari / Chrome Android 的行為） */
console.log('──── A. 自動播放政策下的 AudioContext ────');
{
  const browser = await chromium.launch({
  executablePath: chromiumPath,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--autoplay-policy=document-user-activation-required'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent,
  });
  const page = await ctx.newPage();
  await page.goto(PAGE_URL, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  console.log('  載入後（intro 已呼叫 beep，無使用者手勢）:', await page.evaluate(() => window.__probe().actx));

  // 使用者觸控一次（撬鎖面板）
  const box = await page.locator('#pins').boundingBox();
  await page.touchscreen.tap(box.x + box.width * 0.3, box.y + box.height * 0.6);
  await page.waitForTimeout(800);
  console.log('  使用者觸控之後:', await page.evaluate(() => window.__probe().actx));
  console.log('  → 程式碼中是否有 actx.resume():',
    await page.evaluate(() => document.documentElement.outerHTML.includes('.resume()')));
  await browser.close();
}

/* B. WebGL context loss（設計文件 §2 明列必須處理） */
console.log('\n──── B. WebGL context loss 恢復 ────');
{
  const browser = await chromium.launch({
  executablePath: chromiumPath,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });

  /* 攔截 addEventListener 來偵測有沒有註冊 webglcontextlost。
     不能用「原始碼裡有沒有這個字串」判斷 —— 打包後的 three.js 內部就含有它，
     會變成必定為真的假陽性。 */
  await page.addInitScript(() => {
    window.__glListeners = [];
    const orig = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, ...rest) {
      if (type === 'webglcontextlost' || type === 'webglcontextrestored') {
        window.__glListeners.push({ type, onCanvas: this instanceof HTMLCanvasElement });
      }
      return orig.call(this, type, ...rest);
    };
  });

  await page.goto(PAGE_URL, { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  const listeners = await page.evaluate(() => window.__glListeners ?? []);
  const appHandlers = listeners.filter(l => l.onCanvas);
  console.log(`  有註冊 webglcontextlost/restored 監聽:`,
    appHandlers.length ? JSON.stringify(appHandlers) : '無');

  /* 用 #view 的截圖大小當畫面內容指標。
     readPixels 不行 —— 沒有 preserveDrawingBuffer 時合成後讀回全 0。 */
  const shotSize = async () => (await page.locator('#view').screenshot()).length;
  const isLost = () => page.evaluate(() => {
    const c = document.querySelector('#view canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    return gl ? gl.isContextLost() : null;
  });

  const base = await shotSize();
  await page.evaluate(() => {
    const c = document.querySelector('#view canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    window.__ext = gl.getExtension('WEBGL_lose_context');
    window.__ext.loseContext();
  });
  await page.waitForTimeout(1200);
  const during = await shotSize(), lostFlag = await isLost();

  await page.evaluate(() => window.__ext.restoreContext());
  await page.waitForTimeout(3000);
  const after = await shotSize(), afterFlag = await isLost();

  console.log(`  基準 ${base}B → 遺失 ${during}B (isContextLost=${lostFlag}) → 恢復 ${after}B (isContextLost=${afterFlag})`);
  console.log(`  瀏覽器恢復 context 後畫面是否回來: ${after > during * 3 ? '是' : '否'}`);
  const state = await page.evaluate(() => window.__probe?.() ?? null);
  console.log(`  遊戲狀態是否存活: ${state ? `是（over=${state.over}, intro=${state.intro}）` : '無 probe'}`);
  console.log(`  錯誤訊息(${errs.length}):`, errs.slice(0, 4).join(' | ') || '無');
  await page.screenshot({ path: fileURLToPath(new URL('./build/shots/contextlost.png', import.meta.url)) });
  await browser.close();
}

/* C. 面板高度：驗證「移除 canvas intrinsic 高度」是否就能修好 */
console.log('\n──── C. 面板高度成因驗證 ────');
{
  const browser = await chromium.launch({
  executablePath: chromiumPath,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  for (const dpr of [1, 2, 3]) {
    const ctx = await browser.newContext({
      viewport: { width: 844, height: 390 }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(PAGE_URL, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const before = await page.evaluate(() => ({
      panel: document.getElementById('panel').getBoundingClientRect().height,
      view: document.getElementById('view').getBoundingClientRect().height,
    }));
    // 套上候選修法：panel min-height:0 + canvas position:absolute（脫離 min-content 計算）
    await page.evaluate(() => {
      document.getElementById('panel').style.minHeight = '0';
      const cut = document.getElementById('cut');
      if (cut) { cut.style.position = 'absolute'; cut.style.inset = '0'; }
      document.getElementById('pins').style.position = 'relative';
      dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({
      panel: document.getElementById('panel').getBoundingClientRect().height,
      view: document.getElementById('view').getBoundingClientRect().height,
      canvasAttrH: document.getElementById('cut')?.height,
    }));
    console.log(`  dpr=${dpr}  修正前 panel ${before.panel.toFixed(0)}px / view ${before.view.toFixed(0)}px (${(before.panel/390*100).toFixed(1)}%)` +
                `  →  修正後 panel ${after.panel.toFixed(0)}px / view ${after.view.toFixed(0)}px (${(after.panel/390*100).toFixed(1)}%)`);
    await ctx.close();
  }
  await browser.close();
}
