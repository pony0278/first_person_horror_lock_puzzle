/* 建立可測試的原型副本：
   1. 把 three.js 從 CDN 換成本地檔（測試環境不一定連得到 unpkg）
   2. 注入 window.__probe 測試接點
   產物在 ./build/，不影響 f0_door_prototype_v28.html 本身。 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const build = path.join(here, 'build');
fs.mkdirSync(path.join(build, 'shots'), { recursive: true });

const THREE_SRC = path.join(repo, 'node_modules/three/build/three.module.js');
if (!fs.existsSync(THREE_SRC)) {
  console.error('缺少 three.js。先跑：npm install three@0.160.0');
  process.exit(1);
}
fs.copyFileSync(THREE_SRC, path.join(build, 'three.module.js'));

const src = fs.readFileSync(path.join(repo, 'f0_door_prototype_v28.html'), 'utf-8');
let out = src.replace(
  'https://unpkg.com/three@0.160.0/build/three.module.js',
  './three.module.js');

const PROBE = `
/* ── 測試接點（僅 build 副本，不進原型）── */
window.__probe = () => ({
  pins: R.lock.pins.slice(), progress: R.lock.progress, elapsed: R.elapsed,
  over: R.over, yaw: look.yaw, intro: intro.active,
  actx: actx ? actx.state : 'not-created',
  dpr: devicePixelRatio, rendererSize: [renderer.domElement.width, renderer.domElement.height],
});
/* 強制設定撞針狀態並重畫 —— 讓測試去讀實際畫出來的像素，
   而不是在測試腳本裡複製一份 drawCutaway 的公式（會隨原型改版而失準）。 */
window.__setPins = states => { R.lock.pins = states.slice(); renderPins(); };
window.__pinCentres = () => {
  const el = document.getElementById('pins');
  const w = el.clientWidth, h = el.clientHeight, n = CFG.lock.pinCount;
  const left = h * 0.16 * 2.1, cell = (w - left) / n;
  return { w, h, xs: Array.from({length: n}, (_, i) => left + cell * (i + 0.5)) };
};
`;
const anchor = 'newRound();\nresize();\ntick();';
if (!out.includes(anchor)) { console.error('找不到啟動段落，原型結構可能已變動'); process.exit(1); }
out = out.replace(anchor, PROBE + '\n' + anchor);

fs.writeFileSync(path.join(build, 'f0.html'), out);
console.log('build/f0.html 與 build/three.module.js 已就緒');
console.log('接著跑：npx http-server tools/devicetest/build -p 8100 -s');
