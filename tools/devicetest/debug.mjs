/* Developer Debug & Transition Lab acceptance.
   The lab must build legal checkpoints, replay real transitions, and remain
   completely absent unless the URL explicitly opts in with ?debug=1. */
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
const withDebug = query => {
  const url = new URL(PAGE_URL);
  url.search = query;
  return url.href;
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

await page.goto(PAGE_URL, { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.__probe === 'function');
const normal = await page.evaluate(() => ({
  hidden: document.getElementById('debugLab').hidden,
  hook: typeof window.__debugLab,
  mode: document.body.classList.contains('debug-mode'),
}));
check('Normal player URL has no Debug UI or active hooks',
  normal.hidden && normal.hook === 'undefined' && !normal.mode, JSON.stringify(normal));

await page.goto(withDebug('?debug=1&sequence=door1-door2&stage=approach&speed=1&loop=0&seed=1842'),
  { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.__debugLab === 'function');
let lab = await page.evaluate(() => window.__debugLab());
check('URL opens the requested real Door 1 to Door 2 phase',
  lab.enabled && lab.sequence === 'door1-door2' && lab.stage === 'approach' && lab.phase === 'approach',
  JSON.stringify(lab));
const layout = await page.evaluate(() => {
  const panel = document.getElementById('debugLab').getBoundingClientRect();
  return {
    hidden: document.getElementById('debugLab').hidden,
    w: panel.width, h: panel.height, vw: innerWidth, vh: innerHeight,
  };
});
check('Debug panel fits the target landscape viewport',
  !layout.hidden && layout.w <= layout.vw - 16 && layout.h <= layout.vh - 16,
  JSON.stringify(layout));
await page.screenshot({ path: `${OUT}/debug-transition-lab.png` });

await page.locator('#dbgPlay').click();
const paused0 = await page.evaluate(() => ({ lab: window.__debugLab(), probe: window.__probe() }));
await page.waitForTimeout(500);
const paused1 = await page.evaluate(() => ({ lab: window.__debugLab(), probe: window.__probe() }));
check('Playback pause freezes the transition camera',
  paused0.lab.paused && paused1.lab.paused &&
  paused0.probe.transit === paused1.probe.transit && Math.abs(paused0.probe.tz - paused1.probe.tz) < 0.02,
  `${paused0.probe.transit}/${paused0.probe.tz} → ${paused1.probe.transit}/${paused1.probe.tz}`);
await page.locator('#dbgPlay').click();
await page.locator('button[data-speed="0.5"]').click();
lab = await page.evaluate(() => window.__debugLab());
check('Playback speed is reflected in both UI state and timer rate',
  lab.speed === 0.5 && lab.timerRate === 0.5,
  `speed=${lab.speed} timer=${lab.timerRate}`);

await page.evaluate(() => window.__debugLoad('door2', 'burnout'));
let burnout = await page.evaluate(() => ({ lab: window.__debugLab(), circuit: window.__circuit(), probe: window.__probe() }));
check('Burnout checkpoint is one legal cold restart with a forced spare pickup',
  burnout.lab.stage === 'burnout' && burnout.circuit.burnouts === 1 &&
  burnout.circuit.fuseNumber === 1 && burnout.circuit.awaitingFuse &&
  burnout.probe.pauseReasons.includes('door2-fuse-pickup'),
  JSON.stringify({ lab: burnout.lab, circuit: burnout.circuit, pauses: burnout.probe.pauseReasons }));
const seededBoard = `${burnout.circuit.id}:${burnout.circuit.initial.join('')}`;
await page.evaluate(() => window.__debugLoad('door2', 'burnout'));
burnout = await page.evaluate(() => ({ circuit: window.__circuit() }));
check('Reloading the same Seed reproduces the same Door 2 board',
  `${burnout.circuit.id}:${burnout.circuit.initial.join('')}` === seededBoard,
  `${seededBoard} → ${burnout.circuit.id}:${burnout.circuit.initial.join('')}`);

await page.evaluate(() => window.__debugLoad('door2', 'final-fuse'));
const finalFuse = await page.evaluate(() => ({ lab: window.__debugLab(), circuit: window.__circuit() }));
check('Final-fuse checkpoint keeps the same board and grants no second free diagnostic',
  finalFuse.circuit.fuseNumber === 2 && finalFuse.circuit.autoTests === 1 &&
  finalFuse.circuit.tests === 2 && finalFuse.circuit.id === burnout.circuit.id,
  JSON.stringify(finalFuse));

await page.evaluate(() => window.__debugLoad('door2-door3', 'walk'));
const door3Walk = await page.evaluate(() => ({ lab: window.__debugLab(), door3: window.__door3() }));
check('Door 2 to Door 3 walk checkpoint enters through the real transition machine',
  door3Walk.lab.sequence === 'door2-door3' && door3Walk.lab.phase === 'walk' &&
  door3Walk.door3.active && door3Walk.door3.visible && door3Walk.door3.walking,
  JSON.stringify(door3Walk));

await page.evaluate(() => window.__debugLoad('door2-door3', 'console'));
const door3Console = await page.evaluate(() => ({ lab: window.__debugLab(), door3: window.__door3() }));
check('Console checkpoint starts the post-pause walk toward the centred operator pose',
  door3Console.lab.stage === 'console' && door3Console.lab.phase === 'console' &&
  door3Console.door3.walking &&
  Math.abs(door3Console.door3.operator.x - door3Console.door3.console.layout.x) <= 0.02 &&
  Math.abs(door3Console.door3.operator.yaw) <= 0.1,
  JSON.stringify(door3Console));

await page.locator('#dbgDoor3Operator').click();
await page.waitForFunction(() => window.__debugLab?.().sequence === 'door3' &&
  window.__door3?.().phase === 'explore');
let door3Fx = await page.evaluate(() => ({ lab: window.__debugLab(), door3: window.__door3() }));
check('Door 3 operator button loads the legal centred interaction checkpoint',
  door3Fx.lab.sequence === 'door3' && door3Fx.lab.stage === 'explore' &&
  door3Fx.door3.phase === 'explore' && door3Fx.door3.distanceToOperator <= 0.03 &&
  Math.abs(door3Fx.door3.yaw) <= 0.1,
  JSON.stringify(door3Fx));

await page.locator('button.dbgDoor3Phase[data-time="0.60"]').click();
door3Fx = await page.evaluate(() => ({ lab: window.__debugLab(), door3: window.__door3() }));
check('Door 3 surge preset seeks and freezes both world water and wet vision',
  door3Fx.lab.paused && door3Fx.door3.console.effects.phase === 'surge' &&
  Math.abs(door3Fx.door3.console.effects.burstT - 0.6) <= 0.02 &&
  Math.abs(door3Fx.door3.console.wetGlass.time - 0.6) <= 0.02 &&
  door3Fx.door3.console.wetGlass.amount > 0,
  JSON.stringify({ lab: door3Fx.lab, console: door3Fx.door3.console }));
check('FX playback collapses the Debug panel for an unobstructed visual check',
  await page.locator('#debugLab').evaluate(element => element.classList.contains('collapsed')),
  'collapsed after seek');
await page.locator('#dbgToggle').click();
await page.locator('#dbgDoor3Fx').scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/debug-door3-fx-lab.png` });

await page.locator('#dbgDoor3Rear').click();
door3Fx = await page.evaluate(() => ({ lab: window.__debugLab(), door3: window.__door3() }));
check('Frozen Door 3 FX still permits rear-pipe inspection',
  Math.abs(Math.abs(door3Fx.door3.yaw) - 180) <= 0.1,
  `yaw=${door3Fx.door3.yaw}`);

await page.locator('#dbgDoor3Reset').click();
await page.locator('#dbgDoor3Wet').click();
await page.waitForTimeout(180);
door3Fx = await page.evaluate(() => ({ lab: window.__debugLab(), door3: window.__door3() }));
check('Wet-vision shortcut runs without the pipe-burst geometry',
  !door3Fx.door3.console.effects.pipeBurst && door3Fx.door3.console.wetGlass.active &&
  door3Fx.door3.console.wetGlass.amount > 0,
  JSON.stringify(door3Fx.door3.console));

check('Debug mode produces no browser exceptions', errors.length === 0,
  errors.slice(0, 3).join(' | ') || 'none');
console.log(`\n=== FAIL ${failures} ===`);
await browser.close();
process.exit(failures ? 1 : 0);
