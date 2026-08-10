/* Door 3 pump-hub greybox: spatial, sightline, and look-control checks. */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const chromiumPath = process.env.CHROMIUM_PATH
  || (fs.existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined);
const PAGE_URL = process.env.F0_URL || 'http://127.0.0.1:4173/index.html';
const OUT = fileURLToPath(new URL('./build/shots/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const scenarioUrl = () => {
  const url = new URL(PAGE_URL);
  url.search = '?debug=1&sequence=door2-door3&stage=open&speed=0.25&loop=0&seed=1842';
  return url.href;
};

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} - ${detail}`);
};

const browser = await chromium.launch({
  executablePath: chromiumPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
});

const profiles = [
  { name: 'landscape', width: 844, height: 390, dpr: 2,
    userAgent: devices['iPhone 13'].userAgent },
  { name: 'portrait', width: 390, height: 844, dpr: 2,
    userAgent: devices['iPhone 13'].userAgent },
];

for (const profile of profiles) {
  console.log(`\n[${profile.name}]`);
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.dpr,
    isMobile: true,
    hasTouch: true,
    userAgent: profile.userAgent,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error).slice(0, 240)));

  await page.goto(scenarioUrl(), { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__debugLab === 'function' &&
    window.__door3?.().phase === 'open');

  let state = await page.evaluate(() => window.__door3());
  check('Door 2 and the distant pump room coexist before movement',
    state.phase === 'open' && state.walking && state.visible &&
    Math.abs(state.doorZ - state.rearOpeningZ) <= 0.01,
    `phase=${state.phase} visible=${state.visible} seam=${state.doorZ}/${state.rearOpeningZ}`);
  check('incoming pump connector is long and the legacy end wall is disabled',
    state.connectorLength >= 15.9 && state.runDistance >= 19.5 && !state.vestibuleVisible,
    `connector=${state.connectorLength} run=${state.runDistance} vestibule=${state.vestibuleVisible}`);
  check('Door 3 applies the 1.5x fullscreen pixel budget',
    state.performance.pixelRatio <= 1.5 &&
    state.performance.bufferPixels <= state.performance.pixelBudget,
    JSON.stringify(state.performance));
  check('pump room has no transmission pass and at most two point lights',
    state.performance.transmissionMaterials === 0 && state.performance.pointLights <= 2,
    JSON.stringify(state.performance));
  check('repeated props and static shell are batched',
    state.performance.batching.instancedBatches >= 3 &&
    state.performance.batching.instances >= 30 &&
    state.performance.batching.staticBatches >= 3 &&
    state.performance.batching.batchedSourceDrawCalls >= 54,
    JSON.stringify(state.performance.batching));
  check('continuous approach never starts behind the camera',
    Math.abs(state.z) <= 0.05 && state.hubCenterZ < state.doorZ,
    `phase=${state.phase} walking=${state.walking} visible=${state.visible}`);

  // Continue the legal transition at full speed after the deliberately slow
  // opening checkpoint has been observed, then collapse the Debug overlay.
  await page.locator('button[data-speed="2"]').click();
  await page.keyboard.press('Backquote');
  await page.waitForFunction(() => window.__door3?.().phase === 'through', null, { timeout: 90000 });
  const thresholdStart = await page.evaluate(() => window.__door3());
  check('the open door immediately reveals the flooded destination',
    thresholdStart.visible && thresholdStart.anchors.front.inView &&
    thresholdStart.fadeOpacity <= 0.01,
    `front=${JSON.stringify(thresholdStart.anchors.front)} fade=${thresholdStart.fadeOpacity}`);
  check('raycast from the open doorway reaches the pump room without a wall',
    thresholdStart.sightline.clear,
    JSON.stringify(thresholdStart.sightline));
  check('carried flashlight lights the connector from the first running frame',
    thresholdStart.flashlightIntensity >= 30,
    `flashlight=${thresholdStart.flashlightIntensity}`);
  check('Door 3 approach starts straight through the threshold',
    Math.abs(thresholdStart.yaw) <= 0.5 && Math.abs(thresholdStart.x) <= 0.05 &&
    thresholdStart.z <= 0.05,
    `yaw=${thresholdStart.yaw} x=${thresholdStart.x} z=${thresholdStart.z}`);
  if (profile.name === 'landscape') {
    await page.screenshot({ path: `${OUT}/door3-walk-start.png` });
  }

  await page.waitForFunction(() => window.__door3?.().phase === 'walk', null, { timeout: 10000 });
  const walkStart = await page.evaluate(() => window.__door3());
  await page.waitForFunction(startZ => {
    const state = window.__door3?.();
    return state?.phase === 'walk' && state.z < startZ - 0.45;
  }, walkStart.z, { timeout: 10000 });
  const walkMoved = await page.evaluate(() => window.__door3());
  check('camera keeps advancing toward the already-visible hub',
    walkStart.visible && walkStart.z < thresholdStart.z &&
    walkStart.distanceToHub < thresholdStart.distanceToHub &&
    walkMoved.z < walkStart.z &&
    walkMoved.distanceToHub < walkStart.distanceToHub,
    `z=${thresholdStart.z}>${walkStart.z}>${walkMoved.z} ` +
    `distance=${thresholdStart.distanceToHub}>${walkStart.distanceToHub}>${walkMoved.distanceToHub}`);
  check('sprint lens and unobstructed sightline persist through the long hall',
    walkMoved.fov >= 57.5 && walkMoved.sightline.clear,
    `fov=${walkMoved.fov} sightline=${JSON.stringify(walkMoved.sightline)}`);
  check('flashlight stays bright instead of fading back to lock range',
    walkMoved.flashlightIntensity >= 30 && walkMoved.fadeOpacity <= 0.01,
    `flashlight=${walkMoved.flashlightIntensity} fade=${walkMoved.fadeOpacity}`);
  check('wet footsteps reuse one procedural audio buffer',
    walkMoved.performance.wetStepBufferBuilds <= 1,
    `bufferBuilds=${walkMoved.performance.wetStepBufferBuilds}`);
  if (profile.name === 'landscape') {
    await page.screenshot({ path: `${OUT}/door3-walk-mid.png` });
  }

  await page.waitForFunction(() => window.__door3?.().phase === 'explore', null, { timeout: 90000 });
  state = await page.evaluate(() => window.__door3());
  check('arrival stays at the same pump-hub world position',
    state.active && state.visible && Math.abs(state.z - state.hubCenterZ) <= 0.02,
    `camera=${state.z} hub=${state.hubCenterZ}`);
  check('puzzle panel hidden', state.panelHidden, 'panelHidden=' + state.panelHidden);
  check('Door 3 stays within the draw-call budget',
    state.performance.drawCalls <= state.performance.budget.maxDrawCalls,
    `calls=${state.performance.drawCalls}/${state.performance.budget.maxDrawCalls}`);
  check('rolling frame-time probe has live finite samples',
    state.performance.frameTime.samples >= 30 &&
    Number.isFinite(state.performance.frameTime.averageMs) &&
    Number.isFinite(state.performance.frameTime.p95Ms) &&
    Number.isFinite(state.performance.frameTime.worstMs),
    JSON.stringify(state.performance.frameTime));

  const layout = await page.evaluate(() => {
    const view = document.getElementById('view').getBoundingClientRect();
    const panel = getComputedStyle(document.getElementById('panel'));
    return {
      view: [Math.round(view.width), Math.round(view.height)],
      viewport: [innerWidth, innerHeight],
      panelDisplay: panel.display,
      cue: document.getElementById('turnCue').textContent,
    };
  });
  check('full viewport',
    Math.abs(layout.view[0] - layout.viewport[0]) <= 1 &&
    Math.abs(layout.view[1] - layout.viewport[1]) <= 1 &&
    layout.panelDisplay === 'none', JSON.stringify(layout));

  const frontConsole = state.console;
  check('low left pump console preserves the centre route',
    frontConsole.visible && frontConsole.layout.x < 0 &&
    frontConsole.layout.height <= 1.2 &&
    frontConsole.layout.clearLaneMinX <= -0.25 &&
    state.sightline.clear,
    JSON.stringify({ console: frontConsole.layout, sightline: state.sightline }));

  const consoleYaw = 30;
  await page.evaluate(yaw => window.__door3Look(yaw), consoleYaw);
  await page.waitForTimeout(180);
  state = await page.evaluate(() => window.__door3());
  const consoleBefore = state.console;
  check('all six tank controls and the gauge are visible after one short left turn',
    consoleBefore.controls.length === 6 &&
    consoleBefore.controls.every(control => control.inView &&
      control.x >= 0 && control.x <= layout.viewport[0] &&
      control.y >= 0 && control.y <= layout.viewport[1]) &&
    consoleBefore.gauge.inView &&
    consoleBefore.gauge.x >= 0 && consoleBefore.gauge.x <= layout.viewport[0] &&
    consoleBefore.gauge.y >= 0 && consoleBefore.gauge.y <= layout.viewport[1],
    JSON.stringify({
      yaw: state.yaw, controls: consoleBefore.controls, gauge: consoleBefore.gauge,
    }));
  await page.screenshot({
    path: `${OUT}/door3-${profile.name}-console.png`,
  });

  const raiseCentre = await page.evaluate(() => window.__door3ControlCentre(1, 1));
  await page.mouse.click(raiseCentre.x, raiseCentre.y);
  await page.waitForTimeout(220);
  const raised = await page.evaluate(() => window.__door3());
  check('tank control raises one level and the shared pressure gauge',
    raised.console.levels[1] > consoleBefore.levels[1] &&
    raised.console.levels[0] === consoleBefore.levels[0] &&
    raised.console.levels[2] === consoleBefore.levels[2] &&
    raised.console.pressureBar > consoleBefore.pressureBar &&
    raised.console.interactions === consoleBefore.interactions + 1,
    JSON.stringify({ before: consoleBefore, after: raised.console }));

  const lowerCentre = await page.evaluate(() => window.__door3ControlCentre(1, -1));
  await page.mouse.click(lowerCentre.x, lowerCentre.y);
  await page.waitForTimeout(220);
  state = await page.evaluate(() => window.__door3());
  check('opposite control restores the tank and pressure without moving the view',
    state.console.levels[1] === consoleBefore.levels[1] &&
    state.console.pressureBar === consoleBefore.pressureBar &&
    state.console.interactions === consoleBefore.interactions + 2 &&
    Math.abs(state.yaw - consoleYaw) <= 1,
    JSON.stringify({ before: consoleBefore, after: state.console, yaw: state.yaw }));

  await page.evaluate(() => window.__door3Look(0));
  state = await page.evaluate(() => window.__door3());
  check('returning to the flood door restores the clear centre route',
    Math.abs(state.yaw) <= 1 && state.sightline.clear,
    JSON.stringify({ yaw: state.yaw, sightline: state.sightline }));

  const expected = [
    { yaw: 0, branch: 'front' },
    { yaw: 90, branch: 'left' },
    { yaw: -90, branch: 'right' },
    { yaw: 180, branch: 'rear' },
  ];
  for (const item of expected) {
    await page.evaluate(yaw => window.__door3Look(yaw), item.yaw);
    await page.waitForTimeout(180);
    state = await page.evaluate(() => window.__door3());
    check(item.branch + ' visible', state.anchors[item.branch].inView,
      `yaw=${state.yaw} anchor=${JSON.stringify(state.anchors[item.branch])}`);
    if (profile.name === 'landscape') {
      await page.screenshot({ path: `${OUT}/door3-${item.branch}.png` });
    } else if (item.branch === 'front') {
      await page.screenshot({ path: `${OUT}/door3-portrait-front.png` });
    }
  }

  await page.evaluate(() => window.__door3Look(0));
  const viewBox = await page.locator('#view').boundingBox();
  await page.mouse.move(viewBox.x + viewBox.width * 0.50, viewBox.y + viewBox.height * 0.50);
  await page.mouse.down();
  await page.mouse.move(viewBox.x + viewBox.width * 0.84, viewBox.y + viewBox.height * 0.50,
    { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(260);
  const afterDrag = await page.evaluate(() => window.__door3());
  await page.waitForTimeout(240);
  const heldYaw = (await page.evaluate(() => window.__door3())).yaw;
  check('drag look persists', afterDrag.yaw > 45 && Math.abs(afterDrag.yaw - heldYaw) < 3,
    `after=${afterDrag.yaw} held=${heldYaw}`);

  check('no page errors', errors.length === 0, errors.length ? errors.join(' | ') : 'none');
  await context.close();
}

await browser.close();
if (failures) {
  console.error(`\nDoor 3 scene: ${failures} failure(s)`);
  process.exit(1);
}
console.log('\nDoor 3 scene: all checks passed');
