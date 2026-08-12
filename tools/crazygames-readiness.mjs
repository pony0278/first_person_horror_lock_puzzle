import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DIST = path.resolve('dist');
const MIB = 1024 * 1024;
const LIMITS = Object.freeze({
  initialBytes: 50 * MIB,
  mobileHomepageBytes: 20 * MIB,
  totalBytes: 250 * MIB,
  files: 1500,
  internalSingleFileBytes: 5 * MIB,
});

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

const mib = bytes => `${(bytes / MIB).toFixed(2)} MiB`;
const fail = message => {
  console.error(`::error::${message}`);
  process.exitCode = 1;
};
const warn = message => console.warn(`::warning::${message}`);
const pass = message => console.log(`PASS  ${message}`);

async function main() {
  let files;
  try { files = await walk(DIST); }
  catch {
    fail('dist/ is missing. Run npm run build before npm run cg:readiness.');
    return;
  }

  const indexPath = path.join(DIST, 'index.html');
  if (!files.includes(indexPath)) {
    fail('dist/index.html is missing.');
    return;
  }

  const sizes = await Promise.all(files.map(async file => ({
    file,
    bytes: (await fs.stat(file)).size,
  })));
  const totalBytes = sizes.reduce((sum, item) => sum + item.bytes, 0);
  const indexBytes = sizes.find(item => item.file === indexPath)?.bytes ?? 0;
  const html = await fs.readFile(indexPath, 'utf8');

  console.log('CrazyGames submission artifact');
  console.log(`  files        ${files.length}`);
  console.log(`  total        ${mib(totalBytes)}`);
  console.log(`  index/initial ${mib(indexBytes)}`);

  if (files.length > LIMITS.files)
    fail(`File count ${files.length} exceeds CrazyGames limit ${LIMITS.files}.`);
  else pass(`file count ${files.length}/${LIMITS.files}`);

  if (totalBytes > LIMITS.totalBytes)
    fail(`Total build ${mib(totalBytes)} exceeds CrazyGames 250 MiB limit.`);
  else pass(`total build ${mib(totalBytes)} / 250 MiB`);

  // This project intentionally emits a single-file game, so index.html is the
  // complete game-owned initial payload. The external CrazyGames SDK is platform-owned.
  if (indexBytes > LIMITS.initialBytes)
    fail(`Initial payload ${mib(indexBytes)} exceeds CrazyGames 50 MiB limit.`);
  else pass(`initial payload ${mib(indexBytes)} / 50 MiB`);

  if (indexBytes > LIMITS.mobileHomepageBytes)
    warn(`Initial payload ${mib(indexBytes)} is above the 20 MiB mobile-homepage target.`);
  else pass(`mobile-homepage payload target ${mib(indexBytes)} / 20 MiB`);

  if (indexBytes > LIMITS.internalSingleFileBytes)
    fail(`Internal project budget exceeded: ${mib(indexBytes)} > 5 MiB.`);
  else pass(`internal single-file budget ${mib(indexBytes)} / 5 MiB`);

  const requiredMarkers = [
    ['lang="en"', 'production document language is English'],
    ['First Person Horror Lock Puzzle', 'English production title is present'],
    ['https://sdk.crazygames.com/crazygames-sdk-v3.js', 'CrazyGames SDK v3 script is present'],
    ['__crazyGamesSubmissionQA', 'CG6 Preview QA probe is bundled'],
  ];
  for (const [marker, label] of requiredMarkers) {
    if (!html.includes(marker)) fail(`${label}: marker not found (${marker}).`);
    else pass(label);
  }

  const forbidden = [
    [/file:\/\//i, 'file:// URL'],
    [/[A-Za-z]:\\(?:Users|Windows|Program Files)\\/i, 'Windows absolute path'],
    [/<script[^>]+src=["']\/src\//i, 'unbundled /src/ script'],
  ];
  for (const [pattern, label] of forbidden) {
    if (pattern.test(html)) fail(`Production HTML contains forbidden ${label}.`);
    else pass(`no ${label}`);
  }

  if (!process.exitCode) console.log('READY  CrazyGames artifact checks passed.');
}

await main();
