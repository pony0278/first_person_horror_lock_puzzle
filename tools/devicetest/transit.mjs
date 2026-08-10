/* Door 1 -> Door 2 -> Door 3 integration acceptance.
   Door 2 uses one cold restart: failed submission burns the first fuse, resets
   the four switches, advances the monster and forces a spare-fuse pickup. */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const chromiumPath = process.env.CHROMIUM_PATH
  || (fs.existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined);
const PAGE_URL = process.env.F0_URL || 'http://127.0.0.1:8100/index.html';
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

const probe = () => page.evaluate(() => window.__probe());
const circuit = () => page.evaluate(() => window.__circuit());
const pressBreaker = async () => {
  const point = await page.evaluate(() => window.__circuitBreakerCentre());
  await page.touchscreen.tap(point.x, point.y);
};
const tapSwitch = async index => {
  const point = await page.evaluate(i => window.__circuitSwitchCentre(i), index);
  await page.touchscreen.tap(point.x, point.y);
  await page.waitForTimeout(100);
};
const waitDoor2 = (timeout = 90000) => page.waitForFunction(
  () => window.__probe().transit === 'door2' && window.__circuit()?.active,
  null, { timeout },
);
const autoGrab = async expectedTug => {
  await page.mouse.move(422, 110);
  await page.mouse.down();
  await page.waitForFunction(() => Math.abs(window.__probe().yaw) >= 130,
    null, { timeout: 30000 });
  await page.waitForFunction(expected =>
    Boolean(window.__grabPoint()) || window.__probe().tug === expected,
  expectedTug, { timeout: 30000 });
  const focus = await page.evaluate(expected => ({
    point: window.__grabPoint(),
    retrieved: window.__probe().tug === expected,
  }), expectedTug);
  check(`Fuse ${expectedTug} is visible after turning around`,
    Boolean(focus.point) || focus.retrieved,
    focus.point
      ? `(${focus.point.x.toFixed(0)},${focus.point.y.toFixed(0)})`
      : 'retrieved before coordinate sample');
  await page.screenshot({ path: `${OUT}/door2-fuse-focus.png` });
  await page.waitForFunction(expected => window.__probe().tug === expected &&
    ['grab', 'retrieved', 'door2'].includes(window.__probe().transit),
    expectedTug, { timeout: 30000 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__circuit()?.slot === null,
    null, { timeout: 30000 });
};

await page.goto(PAGE_URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__skipIntro && window.__lockPuzzle && window.__circuit,
  null, { timeout: 30000 });
await page.waitForFunction(() => {
  const puzzle = window.__lockPuzzle();
  return puzzle && (puzzle.wall.ready || puzzle.wall.error);
}, null, { timeout: 30000 });

const door1 = await page.evaluate(() => window.__lockPuzzle());
check('Door 1 still infers one unique pin order',
  door1.ruleId === 'missing-dot-sequence' &&
  JSON.stringify(door1.inferredOrder) === JSON.stringify(door1.trueOrder),
  `rule=${door1.ruleId} order=${door1.inferredOrder.join('>')}`);

await page.evaluate(() => window.__skipIntro());
await page.waitForTimeout(250);
await page.evaluate(() => window.__solveDoor1());
const transit0 = await probe();
await page.waitForTimeout(350);
const transit1 = await probe();
check('Between-door run keeps the completed round paused',
  transit1.over && transit1.paused && transit1.pauseReasons.includes('round'),
  `phase=${transit1.transit} paused=${transit1.pauseReasons.join(',')}`);
check('Between-door run does not consume Door 2 time',
  Math.abs(transit1.elapsed - transit0.elapsed) < 0.15,
  `elapsed ${transit0.elapsed.toFixed(2)}>${transit1.elapsed.toFixed(2)}`);

await waitDoor2();
await page.screenshot({ path: `${OUT}/door2-before-fuse.png` });
const beforePickup = await probe();
const missing = await circuit();
check('Board appears with an empty fuse slot and no solution',
  missing.active && missing.slot === 0 && missing.cost === -1,
  `slot=${missing.slot} cost=${missing.cost}`);
const beforeSwitches = JSON.stringify(missing.switches);
await tapSwitch(0);
check('Board is readable but switches stay locked before fuse pickup',
  JSON.stringify((await circuit()).switches) === beforeSwitches,
  `switches=${(await circuit()).switches.map(x => x.state).join(',')}`);
check('Search phase freezes both chase and monster',
  beforePickup.over && beforePickup.won && beforePickup.paused && !beforePickup.monster,
  `over=${beforePickup.over} monster=${beforePickup.monster}`);
await page.waitForTimeout(500);
const frozen = await probe();
check('Search phase leaks no hidden time',
  Math.abs(frozen.elapsed - beforePickup.elapsed) < 0.15,
  `elapsed ${beforePickup.elapsed.toFixed(2)}>${frozen.elapsed.toFixed(2)}`);

await autoGrab(1);
const afterPickup = await probe();
check('A single sustained look retrieves and inserts the fuse',
  afterPickup.tug === 1 && afterPickup.door === 2,
  `tug=${afterPickup.tug} phase=${afterPickup.transit}`);
check('Door 2 clock starts only after fuse insertion',
  !afterPickup.over && !afterPickup.won && !afterPickup.paused && afterPickup.elapsed < 1.5,
  `elapsed=${afterPickup.elapsed.toFixed(2)} paused=${afterPickup.pauseReasons.join(',')}`);

await page.waitForFunction(() => {
  const state = window.__circuit();
  return state?.autoTests === 1 && state.power === 'off';
}, null, { timeout: 15000 });
await page.evaluate(() => window.__setThreatPaused(true));
let state = await circuit();
check('Insertion grants one automatic diagnostic',
  state.tests === 1 && state.autoTests === 1 && state.fault === 0,
  `tests=${state.tests} auto=${state.autoTests} fault=${state.fault}`);
check('Opening is exactly three switch changes from the answer', state.cost === 3,
  `cost=${state.cost}`);
check('Only four alternating switch modules are interactive',
  state.controls.length === 4 && state.switches.length === 4,
  `controls=${state.controls.join(',')}`);
await page.screenshot({ path: `${OUT}/door2-first-diagnostic.png` });

for (const control of state.controls) await tapSwitch(control);
const allToggled = await circuit();
check('Blindly toggling all four once still fails',
  !allToggled.solved && allToggled.cost === 1,
  `solved=${allToggled.solved} cost=${allToggled.cost}`);
for (const control of state.controls) await tapSwitch(control);

const openingStates = JSON.stringify(state.initial);
const firstFix = await page.evaluate(() => window.__circuitNext());
await tapSwitch(firstFix);
await page.evaluate(() => window.__setThreatPaused(false));
const stationBeforeBurnout = (await probe()).station;
await pressBreaker();
await page.waitForFunction(() => window.__circuit()?.power === 'burnout', null, { timeout: 10000 });
const tripped = await page.evaluate(() => ({
  state: window.__circuit(), blackout: document.querySelector('#trip').classList.contains('on'),
  probe: window.__probe(),
}));
check('First submitted fault burns the fuse instead of granting unlimited retries',
  tripped.blackout && !tripped.probe.over && tripped.state.burnouts === 1,
  `burnouts=${tripped.state.burnouts} over=${tripped.probe.over}`);
await page.waitForFunction(() => {
  const s = window.__circuit();
  return s?.power === 'off' && s.awaitingFuse && s.slot === 0;
}, null, { timeout: 30000 });
state = await circuit();
const pickupPaused = await probe();
check('Cold restart restores the opening switches but preserves the learned scorch',
  JSON.stringify(state.switches.map(item => item.state)) === openingStates &&
  state.scorchedGate === state.fault && state.scorchedGate > 0,
  `fault=${state.fault} scorch=${state.scorchedGate}`);
check('Burnout advances exactly one station and freezes the forced pickup interval',
  pickupPaused.station === Math.min(3, stationBeforeBurnout + 1) &&
  pickupPaused.pauseReasons.includes('door2-fuse-pickup'),
  `station=${stationBeforeBurnout}>${pickupPaused.station} pauses=${pickupPaused.pauseReasons.join(',')}`);

const pickupElapsed = pickupPaused.elapsed;
await page.waitForTimeout(500);
check('Waiting for the spare leaks no hidden time',
  Math.abs((await probe()).elapsed - pickupElapsed) < 0.15,
  `elapsed=${pickupElapsed.toFixed(2)}>${(await probe()).elapsed.toFixed(2)}`);
await autoGrab(2);
await page.waitForFunction(() => window.__circuit()?.power === 'off', null, { timeout: 15000 });
await page.evaluate(() => window.__setThreatPaused(true));
state = await circuit();
check('Spare insertion gives no second free diagnostic',
  state.fuseNumber === 2 && state.tests === 2 && state.autoTests === 1,
  `fuse=${state.fuseNumber} tests=${state.tests} auto=${state.autoTests}`);

let changes = 0;
for (let guard = 0; guard < 4; guard++) {
  const index = await page.evaluate(() => window.__circuitNext());
  if (index < 0) break;
  await tapSwitch(index);
  changes++;
}

state = await circuit();
check('Final cold-restart repair needs the same three intentional changes',
  changes === 3 && state.cost === 0 && state.power === 'off' && state.scorchedGate !== null,
  `changes=${changes} cost=${state.cost} scorch=${state.scorchedGate}`);
const breaker = await page.evaluate(() => window.__circuitBreakerCentre());
check('Breaker touch target is at least 48px', breaker.r >= 24,
  `diameter=${(breaker.r * 2).toFixed(0)}px`);
await pressBreaker();
await page.waitForFunction(() => window.__circuit()?.power === 'solved', null, { timeout: 10000 });
const won = await page.evaluate(() => ({ circuit: window.__circuit(), probe: window.__probe() }));
check('Successful pulse unlocks Door 2 and freezes its clock',
  won.circuit.lastOutcome === 'solved' && won.probe.over && won.probe.won && won.probe.paused,
  `outcome=${won.circuit.lastOutcome} won=${won.probe.won}`);

await page.waitForFunction(() => window.__door3?.().phase === 'explore', null, { timeout: 90000 });
const door3 = await page.evaluate(() => ({ ...window.__door3(), probe: window.__probe() }));
check('Door 2 completion reaches the Door 3 console operator pose',
  door3.active && door3.visible && door3.panelHidden && door3.probe.door === 3 &&
  door3.distanceToOperator <= 0.03 &&
  Math.abs(door3.x - door3.operator.x) <= 0.02 &&
  Math.abs(door3.z - door3.operator.z) <= 0.02,
  'visible=' + door3.visible + ' door=' + door3.probe.door +
  ' operator=' + door3.distanceToOperator);

await page.evaluate(() => window.__setThreatPaused(false));
await page.evaluate(() => window.__newRound());
await page.waitForFunction(() => window.__probe().transit === 'idle' && window.__probe().door === 1,
  null, { timeout: 30000 });
await page.evaluate(() => window.__skipIntro());
await page.waitForTimeout(250);
await page.evaluate(() => window.__solveDoor1());
await waitDoor2();
await autoGrab(1);
await page.waitForFunction(() => window.__circuit()?.power === 'off', null, { timeout: 15000 });
await page.evaluate(() => window.__setThreatPaused(true));
const fatalFirstFix = await page.evaluate(() => window.__circuitNext());
await tapSwitch(fatalFirstFix);
await pressBreaker();
await page.waitForFunction(() => window.__circuit()?.awaitingFuse, null, { timeout: 30000 });
await autoGrab(2);
await page.waitForFunction(() => window.__circuit()?.power === 'off', null, { timeout: 15000 });
await pressBreaker();
await page.waitForFunction(() => window.__probe().over && !window.__probe().won,
  null, { timeout: 30000 });
const fatal = await page.evaluate(() => ({
  circuit: window.__circuit(), probe: window.__probe(),
  message: document.querySelector('#fade div')?.textContent || '',
}));
check('A wrong submission on the spare fuse is fatal and offers no third pickup',
  fatal.circuit.burnouts === 2 && !fatal.circuit.awaitingFuse && fatal.probe.over,
  `burnouts=${fatal.circuit.burnouts} awaiting=${fatal.circuit.awaitingFuse}`);
check('Fatal cold restart reports one precise cause',
  fatal.message === '備用保險絲也熔斷了', `message=${fatal.message}`);

await page.evaluate(() => window.__setThreatPaused(false));
await page.evaluate(() => window.__newRound());
await page.waitForFunction(() => window.__probe().transit === 'idle' && window.__probe().door === 1,
  null, { timeout: 30000 });
await page.evaluate(() => window.__skipIntro());
await page.waitForTimeout(250);
await page.evaluate(() => window.__solveDoor1());
await waitDoor2();
await autoGrab(1);
await page.evaluate(() => window.__addThreatTime(25));
await page.waitForFunction(() => window.__probe().over && !window.__probe().won,
  null, { timeout: 30000 });
const dead = await page.evaluate(() => ({
  ...window.__probe(), message: document.querySelector('#fade div')?.textContent || '',
}));
check('Timeout after fuse insertion still kills the player', dead.over && !dead.won && dead.paused,
  `over=${dead.over} won=${dead.won}`);
check('Retrieved-fuse timeout reports insufficient time', dead.message === '時間不夠',
  `message=${dead.message}`);

check('No JavaScript exceptions during the full flow', errors.length === 0,
  errors.slice(0, 3).join(' | ') || 'none');
console.log(`\n=== FAIL ${failures} ===`);
await browser.close();
process.exit(failures ? 1 : 0);
