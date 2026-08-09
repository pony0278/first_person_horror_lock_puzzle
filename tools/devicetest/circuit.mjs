/* Door 2 dual-line board visual/interaction smoke test at the target phone viewport. */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const chromiumPath = process.env.CHROMIUM_PATH
  || (fs.existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined);
const PAGE_URL = process.env.F0_URL || 'http://127.0.0.1:4173/index.html';
const OUT = fileURLToPath(new URL('./build/shots/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} — ${detail}`);
};

const browser = await chromium.launch({
  executablePath: chromiumPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 844, height: 390 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error).slice(0, 240)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

await page.goto(PAGE_URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__startDoor2 && window.__circuit);
await page.evaluate(() => {
  window.__skipIntro();
  window.__startDoor2();
});
await page.waitForTimeout(250);

const panel = await page.locator('#panel').boundingBox();
const pins = await page.locator('#pins').boundingBox();
const canvas = await page.locator('#circuit').boundingBox();
check('Door 2 canvas fills the lower interaction area',
  Math.abs(canvas.width - pins.width) < 1 && Math.abs(canvas.height - pins.height) < 1,
  `panel=${panel.width.toFixed(0)}x${panel.height.toFixed(0)} pins=${pins.width.toFixed(0)}x${pins.height.toFixed(0)} canvas=${canvas.width.toFixed(0)}x${canvas.height.toFixed(0)}`);
await page.screenshot({ path: `${OUT}/door2-circuit-missing-fuse.png` });

const missing = await page.evaluate(() => window.__circuit());
check('Fuse slot is visible before pickup and controls are locked',
  missing.slot === 0 && missing.cost === -1 && missing.power === 'off',
  `slot=${missing.slot} cost=${missing.cost} power=${missing.power}`);

await page.evaluate(() => {
  window.__insertDoor2Fuse();
  window.__setThreatPaused(true);
});
await page.waitForFunction(() => {
  const state = window.__circuit();
  return state?.autoTests === 1 && state.power === 'off';
}, null, { timeout: 15000 });
const first = await page.evaluate(() => window.__circuit());
check('Insertion runs exactly one free diagnostic and teaches Gate A',
  first.autoTests === 1 && first.tests === 1 && first.fault === 0 && first.cost === 3,
  `tests=${first.tests} auto=${first.autoTests} fault=${first.fault} cost=${first.cost}`);
await page.screenshot({ path: `${OUT}/door2-circuit-first-fault.png` });

const switchPoints = await page.evaluate(() => [0, 1, 2, 3].map(i => window.__circuitSwitchCentre(i)));
const breaker = await page.evaluate(() => window.__circuitBreakerCentre());
const spacing = Math.min(...switchPoints.slice(1).map((point, i) => point.x - switchPoints[i].x));
check('All four switch hit columns exceed the 44px mobile target', spacing >= 88,
  `switch-centre spacing=${spacing.toFixed(1)}px (half-column=${(spacing / 2).toFixed(1)}px)`);
check('Breaker target diameter is at least 48px', breaker.r * 2 >= 48,
  `diameter=${(breaker.r * 2).toFixed(1)}px`);

let diagnosisSteps = 0;
for (let guard = 0; guard < 4; guard++) {
  const index = await page.evaluate(() => window.__circuitNext());
  if (index < 0) break;
  const point = switchPoints[index];
  await page.touchscreen.tap(point.x, point.y);
  diagnosisSteps++;
  const ready = await page.evaluate(() => window.__circuit());
  if (ready.cost === 0) break;
  await page.touchscreen.tap(breaker.x, breaker.y);
  await page.waitForFunction(() => window.__circuit()?.power === 'off', null, { timeout: 10000 });
  const diagnosed = await page.evaluate(() => window.__circuit());
  check(`Diagnostic ${diagnosisSteps} advances beyond the repaired section`,
    diagnosed.fault === null || diagnosed.fault >= diagnosisSteps,
    `fault=${diagnosed.fault} cost=${diagnosed.cost}`);
}

const configured = await page.evaluate(() => window.__circuit());
check('Curated opening requires three intentional switch changes',
  diagnosisSteps === 3 && configured.cost === 0 && configured.power === 'off',
  `changes=${diagnosisSteps} cost=${configured.cost}`);
await page.screenshot({ path: `${OUT}/door2-circuit-ready.png` });

await page.touchscreen.tap(breaker.x, breaker.y);
await page.waitForFunction(() => window.__circuit()?.power === 'solved', null, { timeout: 10000 });
const solved = await page.evaluate(() => ({ circuit: window.__circuit(), probe: window.__probe() }));
check('Only a successful breaker test unlocks Door 2',
  solved.circuit.lastOutcome === 'solved' && solved.probe.over && solved.probe.won,
  `outcome=${solved.circuit.lastOutcome} over=${solved.probe.over} won=${solved.probe.won}`);
await page.screenshot({ path: `${OUT}/door2-circuit-solved.png` });

check('No browser exceptions', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
console.log(`\n=== FAIL ${failures} ===`);
await browser.close();
process.exit(failures ? 1 : 0);
