/**
 * 從 git 取出某個版本的單檔原型，做成可測試的副本。
 *
 * 平常不需要這個 —— 直接 `npm run build` 測 dist/index.html 就好。
 * 這支是要跟舊版本對照時才用，例如確認某個修法真的改變了量測值。
 *
 * 用法：
 *   node tools/devicetest/setup.mjs                 # 預設取 F0 基線的 v28
 *   node tools/devicetest/setup.mjs <git-ref>       # 取指定版本
 *
 * 產物在 tools/devicetest/build/，已 gitignore。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const build = path.join(here, 'build');

/** F0 基線那一版的 v28 —— 尚未套上 B1~B3 修正的原始狀態。 */
const DEFAULT_REF = 'd635c21';
const ref = process.argv[2] ?? DEFAULT_REF;
const FILE = 'f0_door_prototype_v28.html';

fs.mkdirSync(path.join(build, 'shots'), { recursive: true });

let src;
try {
  src = execFileSync('git', ['show', `${ref}:${FILE}`], { cwd: repo, encoding: 'utf-8' });
} catch {
  console.error(`取不到 ${ref}:${FILE} —— 確認這個 ref 存在，且該版本有這個檔案。`);
  process.exit(1);
}

const THREE_SRC = path.join(repo, 'node_modules/three/build/three.module.js');
if (!fs.existsSync(THREE_SRC)) {
  console.error('缺少 three.js。先跑：npm install');
  process.exit(1);
}
fs.copyFileSync(THREE_SRC, path.join(build, 'three.module.js'));

// 舊版走 unpkg CDN，換成本地檔（測試環境不一定連得到）
let out = src.replace(
  'https://unpkg.com/three@0.160.0/build/three.module.js',
  './three.module.js');

// 舊版沒有測試接點（那是後來才進 src/main.js 的），這裡補上
const PROBE = `
/* ── 測試接點（僅此對照副本）── */
window.__probe = () => ({
  pins: R.lock.pins.slice(), progress: R.lock.progress, elapsed: R.elapsed,
  over: R.over, yaw: look.yaw, intro: intro.active,
  actx: actx ? actx.state : 'not-created',
  dpr: devicePixelRatio, rendererSize: [renderer.domElement.width, renderer.domElement.height],
});
window.__setPins = states => { R.lock.pins = states.slice(); renderPins(); };
window.__pinCentres = () => {
  const el = document.getElementById('pins');
  const w = el.clientWidth, h = el.clientHeight, n = CFG.lock.pinCount;
  const left = h * 0.16 * 2.1, cell = (w - left) / n;
  return { w, h, xs: Array.from({ length: n }, (_, i) => left + cell * (i + 0.5)) };
};
`;
const anchor = 'newRound();\nresize();\ntick();';
if (!out.includes(anchor)) {
  console.error(`在 ${ref} 的原型裡找不到啟動段落，無法注入測試接點。`);
  process.exit(1);
}
out = out.replace(anchor, PROBE + '\n' + anchor);

fs.writeFileSync(path.join(build, 'f0.html'), out);
console.log(`已從 ${ref} 產生 tools/devicetest/build/f0.html`);
console.log('接著跑：npx http-server tools/devicetest/build -p 8101 -s');
