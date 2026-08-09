/* Door 1 → Door 2 的裝置流程驗收。
 *
 * Door 2 v4 的主路徑只有一種：按住回頭，把鬆脫零件看進視野，角色自動取下。
 * 盤面則必須依序完成「蓄電器充電 → 切換兩個選擇器 → 經保險絲解鎖」。
 */
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
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({
  viewport: { width: 844, height: 390 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error).slice(0, 240)));

const probe = () => page.evaluate(() => window.__probe());
const pipe = () => page.evaluate(() => window.__pipe());
const pressBreaker = async () => {
  const point = await page.evaluate(() => window.__pipeTestCentre());
  await page.touchscreen.tap(point.x, point.y);
};
const tapCell = async index => {
  const point = await page.evaluate(i => window.__pipeCellCentre(i), index);
  await page.touchscreen.tap(point.x, point.y);
  await page.waitForTimeout(100);
};
const configure = async phase => {
  for (let n = 0; n < 16; n++) {
    const index = await page.evaluate(p => window.__pipeNextFor(p), phase);
    if (index === null) break;
    await tapCell(index);
  }
  return pipe();
};
const waitDoor2 = (timeout = 90000) => page.waitForFunction(
  () => window.__probe().transit === 'door2' && window.__pipe()?.active,
  null, { timeout },
);
const autoGrab = async () => {
  await page.mouse.move(422, 110);
  await page.mouse.down();
  await page.waitForFunction(() => Math.abs(window.__probe().yaw) >= 130,
    null, { timeout: 30000 });
  const point = await page.evaluate(() => window.__grabPoint());
  check('回頭後鬆脫零件確實在視野內', Boolean(point),
    point ? `(${point.x.toFixed(0)},${point.y.toFixed(0)})` : 'null');
  await page.screenshot({ path: `${OUT}/door2-auto-grab-focus.png` });
  await page.waitForFunction(() => window.__probe().tug === 1 &&
    ['grab', 'retrieved', 'door2'].includes(window.__probe().transit),
    null, { timeout: 30000 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__pipe()?.slot === null,
    null, { timeout: 30000 });
};

await page.goto(PAGE_URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__skipIntro && window.__lockPuzzle,
  null, { timeout: 30000 });
await page.waitForFunction(() => {
  const puzzle = window.__lockPuzzle();
  return puzzle && (puzzle.wall.ready || puzzle.wall.error);
}, null, { timeout: 30000 });

const door1 = await page.evaluate(() => window.__lockPuzzle());
check('門 1 的符號＋點數缺格仍能推出唯一順序',
  door1.ruleId === 'missing-dot-sequence' &&
  JSON.stringify(door1.inferredOrder) === JSON.stringify(door1.trueOrder) &&
  door1.missingPins.length === 1,
  `rule=${door1.ruleId} order=${door1.inferredOrder.join('→')}`);
check('門 1 牆面素材成功建立',
  door1.wall.ready && !door1.wall.error && door1.wall.coverage > 0.005,
  `coverage=${door1.wall.coverage.toFixed(3)} bytes=${door1.wall.svgBytes}`);

await page.evaluate(() => window.__skipIntro());
await page.waitForTimeout(250);
await page.evaluate(() => window.__solveDoor1());
const transit0 = await probe();
await page.waitForTimeout(350);
const transit1 = await probe();
check('門間奔跑凍結既有回合',
  transit1.over && transit1.paused && transit1.pauseReasons.includes('round'),
  `phase=${transit1.transit} paused=${transit1.pauseReasons.join(',')}`);
check('門間奔跑不偷吃 Door 2 時間',
  Math.abs(transit1.elapsed - transit0.elapsed) < 0.15,
  `elapsed ${transit0.elapsed.toFixed(2)}→${transit1.elapsed.toFixed(2)}`);

await waitDoor2();
await page.screenshot({ path: `${OUT}/door2-before-pickup.png` });
const beforePickup = await probe();
const missing = await pipe();
check('盤面先上桌但缺件時沒有解',
  missing.active && missing.slot !== null && missing.cost === -1,
  `slot=${missing.slot} cost=${missing.cost}`);
const previewPanel = await page.evaluate(() => ({
  blind: document.querySelector('#panel').classList.contains('blind'),
  opacity: getComputedStyle(document.querySelector('#panel')).opacity,
}));
check('找件前盤面保持清楚可見', !previewPanel.blind && Number(previewPanel.opacity) > 0.8,
  `blind=${previewPanel.blind} opacity=${previewPanel.opacity}`);
const previewSelectors = JSON.stringify(missing.selectors);
await tapCell(missing.controls[0]);
check('找件前盤面只可閱讀、不可先操作',
  JSON.stringify((await pipe()).selectors) === previewSelectors,
  `selectors=${(await pipe()).selectors.map(x => x.rot).join(',')}`);
check('找零件期間倒數與怪物仍凍結',
  beforePickup.over && beforePickup.won && beforePickup.paused &&
  beforePickup.pauseReasons.includes('round') && !beforePickup.monster,
  `over=${beforePickup.over} monster=${beforePickup.monster} paused=${beforePickup.pauseReasons.join(',')}`);
await page.waitForTimeout(500);
const frozen = await probe();
check('停在盤面前思考或找零件不會漏秒',
  Math.abs(frozen.elapsed - beforePickup.elapsed) < 0.15,
  `elapsed ${beforePickup.elapsed.toFixed(2)}→${frozen.elapsed.toFixed(2)}`);

await autoGrab();
const afterPickup = await probe();
const initial = await pipe();
check('只需注視一次就自動完成取件', afterPickup.tug === 1,
  `tug=${afterPickup.tug} phase=${afterPickup.transit}`);
check('零件落槽後才啟動 Door 2 的 20 秒回合',
  !afterPickup.over && !afterPickup.won && !afterPickup.paused &&
  afterPickup.door === 2 && afterPickup.limit === 20 && afterPickup.elapsed < 1.5,
  `elapsed=${afterPickup.elapsed.toFixed(2)} paused=${afterPickup.pauseReasons.join(',')}`);
check('開局明確是充電階段且距離答案三步',
  initial.phase === 'charge' && !initial.charged && initial.cost === 3,
  `phase=${initial.phase} charged=${initial.charged} cost=${initial.cost}`);
check('盤面只有四個真實機械選擇器',
  initial.controls.length === 4 && initial.selectors.length === 4,
  `controls=${initial.controls.join(',')}`);

const selectorBeforeFixedTap = JSON.stringify(initial.selectors);
const fixedIndex = Array.from({ length: 16 }, (_v, i) => i)
  .find(i => !initial.controls.includes(i));
await tapCell(fixedIndex);
const afterFixedTap = await pipe();
check('固定管線點了不會旋轉',
  JSON.stringify(afterFixedTap.selectors) === selectorBeforeFixedTap,
  `selectors=${afterFixedTap.selectors.map(x => x.rot).join(',')}`);

for (const index of initial.controls) await tapCell(index);
const afterAllFour = await pipe();
check('四個選擇器全部各亂點一次仍不會過',
  !afterAllFour.solved && afterAllFour.cost === 1,
  `solved=${afterAllFour.solved} cost=${afterAllFour.cost}`);

const directUnlock = await configure('unlock');
check('玩家能看見並配置一條看似直達門鎖的錯路',
  directUnlock.phase === 'charge' && directUnlock.outcome === 'bypass',
  `phase=${directUnlock.phase} outcome=${directUnlock.outcome}`);
const tripClock0 = (await probe()).elapsed;
await pressBreaker();
await page.waitForFunction(() => window.__pipe()?.power === 'trip',
  null, { timeout: 30000 });
await page.screenshot({ path: `${OUT}/door2-bypass-trip.png` });
const trip = await page.evaluate(() => ({
  pipe: window.__pipe(), probe: window.__probe(),
  blackout: document.querySelector('#trip').classList.contains('on'),
}));
check('錯把電送往門鎖會跳電，但不直接判死',
  trip.pipe.lastOutcome === 'bypass' && trip.pipe.shorts === 1 &&
  trip.blackout && !trip.probe.over,
  `outcome=${trip.pipe.lastOutcome} trips=${trip.pipe.shorts} over=${trip.probe.over}`);
await page.waitForFunction(() => window.__pipe()?.power === 'off',
  null, { timeout: 30000 });
const tripClock1 = (await probe()).elapsed;
check('跳電用真實時間懲罰，之後仍可修正',
  tripClock1 - tripClock0 >= 0.8 && !(await probe()).over,
  `elapsed ${tripClock0.toFixed(2)}→${tripClock1.toFixed(2)}`);

const chargeReady = await configure('charge');
check('修正三個錯位後只完成充電配置，尚未開門',
  chargeReady.solved && chargeReady.phase === 'charge' && chargeReady.power === 'off',
  `solved=${chargeReady.solved} phase=${chargeReady.phase}`);
await pressBreaker();
await page.waitForFunction(() => {
  const state = window.__pipe();
  return state?.phase === 'unlock' && state.power === 'off';
}, null, { timeout: 30000 });
const charged = await pipe();
check('送電成功後蓄電器保持亮起並切到解鎖階段',
  charged.charged && charged.charges === 1 && charged.phase === 'unlock',
  `charged=${charged.charged} charges=${charged.charges} phase=${charged.phase}`);
check('充電解到解鎖解必須再翻兩個選擇器',
  charged.cost === 2 && !charged.solved,
  `cost=${charged.cost} solved=${charged.solved}`);
await page.screenshot({ path: `${OUT}/door2-charged-stage.png` });

const unlockReady = await configure('unlock');
check('第二階段配置完成仍須親自按斷路器確認',
  unlockReady.solved && unlockReady.power === 'off',
  `solved=${unlockReady.solved} power=${unlockReady.power}`);
const breaker = await page.evaluate(() => window.__pipeTestCentre());
check('主斷路器觸控目標直徑至少 48px', breaker.r >= 24,
  `diameter=${(breaker.r * 2).toFixed(0)}px`);
await pressBreaker();
await page.waitForFunction(() => window.__pipe()?.power === 'solved',
  null, { timeout: 30000 });
const wonPipe = await pipe();
const wonProbe = await probe();
check('電流經保險絲抵達門閂後才真正解鎖',
  wonPipe.lastOutcome === 'solved' && wonProbe.over && wonProbe.won,
  `outcome=${wonPipe.lastOutcome} over=${wonProbe.over}`);
check('解鎖瞬間凍結 Door 2 牆鐘',
  wonProbe.paused && wonProbe.pauseReasons.includes('round'),
  `paused=${wonProbe.pauseReasons.join(',')}`);
try {
  await page.waitForFunction(() => window.__doorPanel().mode === 'green',
    null, { timeout: 15000 });
  check('解鎖後門面 LCD 跳綠', true, 'mode=green');
} catch {
  check('解鎖後門面 LCD 跳綠', false,
    `mode=${await page.evaluate(() => window.__doorPanel().mode)}`);
}

await page.waitForFunction(() => {
  const state = window.__probe();
  return state.transit === 'idle' && !state.over && state.door === 1;
}, null, { timeout: 90000 });
const reset = await probe();
check('完成後整局重開並清除 Door 2 狀態',
  reset.door === 1 && reset.tug === 0 && !reset.paused && reset.decayFloor === 0,
  `door=${reset.door} tug=${reset.tug} floor=${reset.decayFloor}`);

/* 再跑一趟，只驗證取回零件後的 Door 2 超時死亡與死因。 */
await page.evaluate(() => window.__skipIntro());
await page.waitForTimeout(250);
await page.evaluate(() => window.__solveDoor1());
await waitDoor2();
await autoGrab();
await page.evaluate(() => window.__addThreatTime(25));
await page.waitForFunction(() => window.__probe().over && !window.__probe().won,
  null, { timeout: 30000 });
const dead = await page.evaluate(() => ({
  ...window.__probe(), message: document.querySelector('#fade div')?.textContent || '',
}));
check('零件取回後超時仍會被怪物殺死',
  dead.over && !dead.won && dead.paused,
  `over=${dead.over} won=${dead.won} paused=${dead.pauseReasons.join(',')}`);
check('取回零件後的死亡原因是時間不夠',
  dead.message === '時間不夠', `message=${dead.message}`);

check('全程無 JavaScript 例外', errors.length === 0,
  errors.slice(0, 3).join(' | ') || '無');
console.log(`\n=== FAIL ${failures} 項 ===`);
await browser.close();
process.exit(failures ? 1 : 0);
