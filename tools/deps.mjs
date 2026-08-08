/* 模組相依檢查：列出各模組行數、驗證分層方向、找出循環相依。
 *
 *   node tools/deps.mjs
 *
 * 有循環就以結束碼 1 收場，適合掛進 CI。
 * 循環在執行期不一定會炸（ES module 對函式宣告很寬容），但它會讓
 * 「這個檔案到底依賴誰」變得無法回答 —— 那正是拆模組要解決的問題。
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'src';
const files = new Map();
/* Module IDs follow ES module specifiers and always use POSIX separators.
   Normalize Windows paths before layer and import-graph checks. */
const moduleId = p => p.split(path.sep).join('/');

const walk = d => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|ts)$/.test(e.name)) files.set(moduleId(path.relative(SRC, p)), fs.readFileSync(p, 'utf-8'));
  }
};
walk(SRC);

/** 分層：數字越小越底層，只能被更上層匯入。 */
const LAYER = [
  [/^logic\//, 0, 'logic'],
  [/^(state|dom)\.js$/, 1, 'state/dom'],
  [/^render\//, 2, 'render'],
  [/^game\//, 3, 'game'],
  [/^main\.js$/, 4, 'main'],
];
const layerOf = f => LAYER.find(([re]) => re.test(f))?.[1] ?? 99;
const layerName = f => LAYER.find(([re]) => re.test(f))?.[2] ?? '?';

const edges = new Map();
for (const [f, body] of files) {
  const deps = new Set();
  const re = /(?:from\s+|^\s*import\s+)'(\.[^']+)'/gm;
  for (const m of body.matchAll(re)) {
    let t = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
    if (!files.has(t) && files.has(t.replace(/\.js$/, '.ts'))) t = t.replace(/\.js$/, '.ts');
    if (files.has(t)) deps.add(t);
  }
  edges.set(f, deps);
}

/* ── 行數 ── */
const rows = [...files].map(([f, b]) => [b.split('\n').length, f]).sort((a, b) => b[0] - a[0]);
console.log('模組行數：');
for (const [n, f] of rows) console.log(`  ${String(n).padStart(5)}  src/${f}`);
console.log(`  ${String(rows.reduce((a, r) => a + r[0], 0)).padStart(5)}  合計（${rows.length} 個模組，最大 ${rows[0][0]} 行）`);

/* ── 分層違規 ── */
const violations = [];
for (const [f, deps] of edges) {
  for (const d of deps) {
    if (layerOf(d) > layerOf(f)) violations.push(`${f} (${layerName(f)}) → ${d} (${layerName(d)})`);
  }
}
console.log('\n分層方向（logic → state/dom → render → game → main）：');
if (violations.length) violations.forEach(v => console.log('  ✗ 反向匯入：', v));
else console.log('  ✓ 全部單向');

/* ── 循環 ── */
const cycles = new Set();
const dfs = (n, stack, seen) => {
  if (stack.includes(n)) { cycles.add([...stack.slice(stack.indexOf(n)), n].join(' → ')); return; }
  if (seen.has(n)) return;
  seen.add(n);
  for (const d of [...(edges.get(n) ?? [])].sort()) dfs(d, [...stack, n], seen);
};
for (const f of [...files.keys()].sort()) dfs(f, [], new Set());

console.log('\n相依循環：');
if (cycles.size) { for (const c of cycles) console.log('  ✗', c); }
else console.log('  ✓ 無');

process.exit(violations.length || cycles.size ? 1 : 0);
