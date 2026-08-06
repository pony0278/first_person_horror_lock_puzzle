/* 場景與接點的**結構**指紋。
 *
 * 拆模組是純粹的程式碼搬移，行為必須一模一樣。單看行為測試會過不代表沒漏東西 ——
 * 少加一個 mesh、少接一個事件監聽，多數斷言不會察覺。這支把 Three.js 的場景圖
 * 結構、材質、幾何、以及全域接點與事件監聽抓成一份可比對的指紋。
 *
 *   node tools/devicetest/signature.mjs > /tmp/before.json
 *   ...重構...
 *   node tools/devicetest/signature.mjs > /tmp/after.json && diff /tmp/before.json /tmp/after.json
 *
 * **刻意不含位置、縮放、光源強度。** 鏡頭呼吸、燈光閃爍、手部姿態、積水動畫都在跑，
 * 那些值每次取樣都不同（實測同一份建置連跑兩次就會有差），放進來指紋就失去可比性。
 * 位置類的迴歸由 devicetest / safearea / pinread 的實際量測與截圖負責。
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
const ctx = await browser.newContext({
  viewport: { width: 844, height: 390 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent,
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)); });

await page.addInitScript(() => {
  window.__sigListeners = [];
  const orig = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, ...rest) {
    let target = 'other';
    if (this === window) target = 'window';
    else if (this === document) target = 'document';
    else if (this instanceof HTMLCanvasElement) target = 'canvas';
    else if (this instanceof HTMLElement && this.id) target = '#' + this.id;
    window.__sigListeners.push(target + ':' + type);
    return orig.call(this, type, ...rest);
  };
});
await page.goto(PAGE_URL, { waitUntil: 'load' });
await page.waitForTimeout(2500);

/* 少數材質顏色是每幀寫入的（提示牆的指示燈在呼吸）。取三次不等間隔的樣本，
   任一格三次不全同就抹成 '~' —— 用等間隔會有跟正弦波同週期而恰好相同的風險。 */
const sample = () => page.evaluate(() => {
  const walk = o => {
    const m = o.material;
    return {
      mat: !m ? null : Array.isArray(m) ? m.map(x => x.type).join('+')
        : `${m.type}|${m.color ? m.color.getHexString() : '-'}`,
      c: o.children.map(walk),
    };
  };
  return walk(window.__scene);
});
const s1 = await sample();
await page.waitForTimeout(370);
const s2 = await sample();
await page.waitForTimeout(830);
const s3 = await sample();
await page.evaluate(([a, b, c]) => { window.__samples = [a, b, c]; }, [s1, s2, s3]);

const sig = await page.evaluate(() => {
  /* 依走訪順序對照三次取樣，顏色會變的材質標成 '~' */
  const path = [];
  const at = (sam, p) => p.reduce((n, i) => n?.c?.[i], sam);
  const stableMat = (o, mat) => {
    const [a, b, c] = window.__samples ?? [];
    if (!a) return mat;
    const x = at(a, path), y = at(b, path), z = at(c, path);
    if (x && y && z && !(x.mat === y.mat && y.mat === z.mat)) return '~ 每幀變動';
    return mat;
  };

  const walk = (o, idx = null) => {
    if (idx !== null) path.push(idx);
    const m = o.material;
    const mat = !m ? null
      : Array.isArray(m) ? m.map(x => x.type).join('+')
      : `${m.type}|${m.color ? m.color.getHexString() : '-'}` +
        `|r${m.roughness ?? '-'}|m${m.metalness ?? '-'}|tr${m.transparent ? 1 : 0}` +
        `|side${m.side}|depthW${m.depthWrite ? 1 : 0}`;
    const g = o.geometry;
    const geo = !g ? null
      : `${g.type}|v${g.attributes?.position?.count ?? 0}|i${g.index?.count ?? 0}` +
        `|attrs:${Object.keys(g.attributes ?? {}).sort().join(',')}`;
    const node = {
      t: o.type,
      n: o.name || '',
      geo, mat: stableMat(o, mat),
      ...(o.isLight ? { lightColor: o.color.getHexString(), lightType: o.type } : {}),
      ...(o.isCamera ? { fov: o.fov, near: o.near, far: o.far } : {}),
      c: o.children.map((ch, i) => walk(ch, i)),
    };
    if (idx !== null) path.pop();
    return node;
  };

  const scene = window.__scene;
  const count = o => 1 + o.children.reduce((a, c) => a + count(c), 0);
  const byType = {};
  const tally = o => { byType[o.type] = (byType[o.type] ?? 0) + 1; o.children.forEach(tally); };
  if (scene) tally(scene);

  const probe = window.__probe();
  return {
    objectCount: scene ? count(scene) : null,
    byType,
    fog: scene?.fog ? `${scene.fog.constructor.name}|${scene.fog.color.getHexString()}|${scene.fog.density ?? '-'}` : null,
    globals: {
      probeKeys: Object.keys(probe).sort(),
      pins: probe.pins,
      hasSetPins: typeof window.__setPins,
      hasPinCentres: typeof window.__pinCentres,
      hasApplySeep: typeof window.__applySeep,
      hasScene: typeof window.__scene,
    },
    dom: {
      panelChildren: [...document.getElementById('panel').children].map(e => e.id || e.tagName),
      cutCanvas: !!document.getElementById('cut'),
      viewCanvases: document.querySelectorAll('#view canvas').length,
      haltPresent: !!document.getElementById('halt'),
    },
    listeners: [...new Set(window.__sigListeners)].sort(),
    sceneTree: scene ? walk(scene) : null,
  };
});

console.log(JSON.stringify({ ...sig, errors: errs }, null, 1));
await browser.close();
