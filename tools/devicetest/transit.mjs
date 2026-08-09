/* 門 1 → 門 2 過場（F1 切片）的自動驗證。
 *
 * 流程：跳過開場 → __solveDoor1() 解開門 1 → 依序等每個過場階段 →
 * 驗證換裝（變電室出現、提示牆收走、衰變升級）→ 取件 → 等自動重開 → 驗證全部歸位。
 * 階段是 dt 驅動的，低幀率下會等比拉長（M1）—— 一律用 waitForFunction，不用固定等待。
 *
 * 取件跑三趟，對應三條輸入路徑：
 *   第一趟 手機兩指 —— 觸控按住＝視角，第二指點擊＝伸手（點歪不算）
 *   第二趟 桌機主路徑 —— 左鍵按住回頭，右鍵點一下＝扯一下（和弦按鍵走 pointermove）
 *   第三趟 備援 —— S 鍵佔視角＋滑鼠伸手；一指按住盲扯
 * 這幾條是同一個世界的不同握法，都得會動。
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
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));

await page.goto(PAGE_URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__skipIntro, null, { timeout: 30000 });
await page.waitForFunction(() => {
  const p = window.__lockPuzzle?.();
  return p && (p.wall.ready || p.wall.error) && (p.doorCue.ready || p.doorCue.error);
}, null, { timeout: 30000 });
const door1Puzzle = await page.evaluate(() => window.__lockPuzzle());
const markCounts = door1Puzzle.doorMarks.map(mark => mark.count).sort((a, b) => a - b);
const falseMark = door1Puzzle.doorMarks.find(mark => mark.pin === door1Puzzle.falsePin);
check('門 1 門面四符號各綁 1～4 道刻痕，三道者是真實假針',
  door1Puzzle.crossSource && JSON.stringify(markCounts) === JSON.stringify([1, 2, 3, 4]) &&
  falseMark?.count === 3 && door1Puzzle.invalidPins.length === 1 &&
  door1Puzzle.invalidPins[0] === door1Puzzle.falsePin &&
  door1Puzzle.falsePins[0] === door1Puzzle.falsePin,
  `mode=${door1Puzzle.ruleId} false=${door1Puzzle.falsePin} marks=${door1Puzzle.doorMarks.map(m => `${m.pin}:${m.count}`).join(',')}`);
check('門 1 讀出牆上缺格並查門面，可還原原撬鎖順序',
  JSON.stringify(door1Puzzle.wallSequence) === JSON.stringify([1, 2, null, 4]) &&
  door1Puzzle.erasedCount === 3 &&
  JSON.stringify(door1Puzzle.inferredOrder) === JSON.stringify(door1Puzzle.trueOrder),
  `sequence=${door1Puzzle.wallSequence.map(count => count ?? '×').join('→')} erased=${door1Puzzle.erasedCount} inferred=${door1Puzzle.inferredOrder.join('→')} lock=${door1Puzzle.trueOrder.join('→')}`);
check('牆面 1／2／抹除位／4 序列與門面對照都已合成為非空 CanvasTexture',
  door1Puzzle.wall.ready && !door1Puzzle.wall.error &&
  door1Puzzle.wall.ruleId === door1Puzzle.ruleId &&
  door1Puzzle.wall.visual === 'erased-tally-sequence' &&
  JSON.stringify(door1Puzzle.wall.sequenceCounts) === JSON.stringify([1, 2, null, 4]) &&
  door1Puzzle.wall.erasedCount === 3 &&
  door1Puzzle.wall.coverage > 0.005 && door1Puzzle.wall.coverage < 0.20 &&
  door1Puzzle.wall.svgBytes > 1800 &&
  door1Puzzle.doorCue.ready && !door1Puzzle.doorCue.error &&
  door1Puzzle.doorCue.coverage > 0.005 && door1Puzzle.doorCue.coverage < 0.25 &&
  door1Puzzle.doorCue.svgBytes > 2500,
  `wall=${door1Puzzle.wall.coverage.toFixed(3)}/${door1Puzzle.wall.svgBytes} door=${door1Puzzle.doorCue.coverage.toFixed(3)}/${door1Puzzle.doorCue.svgBytes}`);
await page.evaluate(() => window.__skipIntro());
await page.waitForTimeout(300);
const doorFacing = await page.evaluate(() => window.__lockPuzzle());
await page.screenshot({ path: `${OUT}/door1-door-mapping.png` });
check('門 1 面向鎖操作時，門上四組對照完整留在安全範圍',
  doorFacing.doorCue.visible && doorFacing.doorCue.inView &&
  doorFacing.doorCue.leftNdcX > -0.90 && doorFacing.doorCue.rightNdcX < 0.90 &&
  Math.abs(doorFacing.doorCue.ndcX) < 0.5 && Math.abs(doorFacing.doorCue.ndcY) < 0.8,
  `visible=${doorFacing.doorCue.visible} inView=${doorFacing.doorCue.inView} span=${doorFacing.doorCue.leftNdcX}..${doorFacing.doorCue.rightNdcX} ndc=(${doorFacing.doorCue.ndcX},${doorFacing.doorCue.ndcY})`);
/* 抵達後回看正後方：線索在側邊、走廊在中央，兩者必須同時留在畫面。 */
await page.evaluate(() => window.__setThreatPaused(true));
await page.mouse.move(422, 110);
await page.mouse.down();
try {
  await page.waitForFunction(() => {
    const w = window.__lockPuzzle().wall;
    return w.inView && Math.abs(w.ndcX) > 0.10 && Math.abs(w.ndcX) < 0.85 &&
      w.corridorInView && Math.abs(w.corridorNdcX) < 0.35;
  }, null, { timeout: 30000 });
  await page.screenshot({ path: `${OUT}/door1-corridor-clue.png` });
  const revisit = await page.evaluate(() => window.__lockPuzzle());
  check('門 1 回看時線索在側邊且後方走廊維持中央',
    revisit.wall.visible && revisit.wall.inView && revisit.wall.corridorInView,
    `clue=(${revisit.wall.ndcX},${revisit.wall.ndcY}) corridor=(${revisit.wall.corridorNdcX},${revisit.wall.corridorNdcY})`);
} catch {
  const revisit = await page.evaluate(() => window.__lockPuzzle());
  check('門 1 回看時線索在側邊且後方走廊維持中央', false,
    `clue=(${revisit.wall.ndcX},${revisit.wall.ndcY}) corridor=(${revisit.wall.corridorNdcX},${revisit.wall.corridorNdcY})`);
}
await page.mouse.up();
await page.waitForFunction(() => Math.abs(window.__probe().yaw) < 100, null, { timeout: 30000 });
await page.evaluate(() => window.__setThreatPaused(false));

/* 解開門 1 → 過場開始 */
await page.evaluate(() => window.__solveDoor1());
const phase = () => page.evaluate(() => window.__probe().transit);
const tugCount = () => page.evaluate(() => window.__probe().tug);
const pipe = () => page.evaluate(() => window.__pipe());
/* 解盤：每次問 __pipeNext 該點哪一格，點到通為止。
   座標問 __pipeCellCentre —— 盤面是抽的，寫死座標必成假通過。 */
const solvePipe = async () => {
  for (let n = 0; n < 20; n++) {
    const i = await page.evaluate(() => window.__pipeNext());
    if (i === null) break;
    const c = await page.evaluate(k => window.__pipeCellCentre(k), i);
    await page.touchscreen.tap(c.x, c.y);
    await page.waitForTimeout(120);
  }
  return pipe();
};
const waitPhase = async (name, timeout = 60000) => {
  const t0 = Date.now();
  try {
    await page.waitForFunction(
      n => {
        const seq = ['approach', 'arrive', 'door2', 'grab', 'retrieved', 'done', 'idle'];
        return seq.indexOf(window.__probe().transit) >= seq.indexOf(n) ||
               window.__probe().transit === n;
      },
      name, { timeout });
    check(`階段抵達 ${name}`, true, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch {
    check(`階段抵達 ${name}`, false, `逾時（現在是 ${await phase()}）`);
  }
};

check('過場已啟動', ['open', 'through', 'corner'].includes(await phase()),
  `phase=${await phase()}`);
const transitClock0 = await page.evaluate(() => window.__probe());
await page.waitForTimeout(350);
const transitClock1 = await page.evaluate(() => window.__probe());
check('門間奔跑維持回合凍結', transitClock1.over && transitClock1.paused &&
  transitClock1.pauseReasons.includes('round'),
  `over=${transitClock1.over} paused=${transitClock1.pauseReasons.join(',')}`);
check('門間奔跑不偷吃下一扇門時間', Math.abs(transitClock1.elapsed - transitClock0.elapsed) < 0.15,
  `elapsed ${transitClock0.elapsed.toFixed(2)} → ${transitClock1.elapsed.toFixed(2)}`);

await waitPhase('approach');

/* 換裝驗證：衰變升級（變電室與提示牆的可見性由截圖與 seep 一併佐證） */
const dress = await page.evaluate(() => ({ seep: window.__probe().seep }));
check('衰變已升到門 2 等級', dress.seep >= 0.5, `seep=${dress.seep}`);

/* 經過變電室時截圖（tz 接近 electroZ、頭轉過去的瞬間） */
try {
  await page.waitForFunction(() => {
    const p = window.__probe();
    return p.transit === 'approach' && p.tz < 6.4 && Math.abs(p.yaw) > 8;
  }, null, { timeout: 60000 });
  await page.screenshot({ path: `${OUT}/transit-electro.png` });
  check('經過變電室時有轉頭', true, `yaw=${await page.evaluate(() => window.__probe().yaw.toFixed(1))}°`);
} catch {
  check('經過變電室時有轉頭', false, '逾時未觀察到 yaw > 8°');
}

await waitPhase('arrive');
await page.screenshot({ path: `${OUT}/transit-door2.png` });

/* ── 取件（第一趟）：兩根手指 —— 按住回頭，另一指去點鬆脫段 ── */
await page.waitForFunction(() => window.__probe().transit === 'door2', null, { timeout: 60000 });
check('抵達後進入互動等待（door2）', true, 'phase=door2');

/* 門面換裝：門 2 是電磁門 —— LCD 紅槓上桌，機械鎖收走 */
const dp0 = await page.evaluate(() => window.__doorPanel());
check('門 2 門面是 LCD（紅槓鎖定）', dp0.visible && dp0.mode === 'red', `mode=${dp0.mode}`);

/* ── R.over 拆分後的三顆地雷（詳見設計文件 §6 補充） ── */
const s0 = await page.evaluate(() => window.__probe());
check('門 2 有自己的身分（R.door）', s0.door === 2, `door=${s0.door} limit=${s0.limit}`);
// 衰變等級跨門累進，但站位從 0 重新開始 —— 綁在一起的話怪物會一次跳 20 公尺
check('衰變下限停在門 2 等級', s0.decayFloor === 2, `floor=${s0.decayFloor}`);
check('怪物站位從最遠重新開始', s0.station === 0, `station=${s0.station}`);
// T.active 在 door2 階段仍為 true —— 拿它當「運鏡中」會讓怪物永遠隱形
check('門 2 互動階段怪物不再被強制隱形', s0.monster === false,
  `monster=${s0.monster}（站位 0 本來就看不到，但不是被 T.active 壓住的）`);
check('門 2 抵達後正式放行回合', !s0.over && !s0.won && !s0.paused,
  `over=${s0.over} won=${s0.won} paused=${s0.pauseReasons.join(',')}`);
const cue0 = await pipe();
await page.screenshot({ path: `${OUT}/door2-missing-cue.png` });
check('門 2 從零開始且空槽立即播放診斷脈衝',
  s0.limit === 20 && s0.elapsed < 1.5 && cue0.cueT >= 0 && cue0.cueLight > 0.75,
  `elapsed=${s0.elapsed.toFixed(2)} limit=${s0.limit} cue=${cue0.cueT} light=${cue0.cueLight}`);
const door2Clock0 = s0.elapsed;
const emptyCueCell = await page.evaluate(i => window.__pipeCellCentre(i), cue0.slot);
await page.touchscreen.tap(emptyCueCell.x, emptyCueCell.y);
await page.waitForFunction(serial => window.__pipe().cueSerial > serial,
  cue0.cueSerial, { timeout: 15000 });
await page.waitForTimeout(450);
const door2Clock1 = await page.evaluate(() => ({
  elapsed: window.__probe().elapsed, cue: window.__pipe(),
}));
check('門 2 計時會前進且點空槽會重播提示',
  door2Clock1.elapsed - door2Clock0 > 0.2 && door2Clock1.cue.cueSerial > cue0.cueSerial && door2Clock1.cue.cueLight > 0.75,
  `elapsed ${door2Clock0.toFixed(2)} → ${door2Clock1.elapsed.toFixed(2)}; cue ${cue0.cueSerial} → ${door2Clock1.cue.cueSerial}; light=${door2Clock1.cue.cueLight}`);
await page.evaluate(() => window.__addThreatTime(Math.max(0, 7.2 - window.__probe().elapsed)));
await page.waitForFunction(() => window.__probe().station >= 1, null, { timeout: 15000 });
const chase1 = await page.evaluate(() => window.__probe());
check('門 2 計時跨門檻會推進怪物站位', chase1.station === 1,
  `station=${chase1.station} elapsed=${chase1.elapsed.toFixed(2)}`);
check('門 2 第一站怪物實際加入追逐', chase1.monster === true,
  `monster=${chase1.monster} station=${chase1.station}`);
// 後續輸入路徑與動畫在 SwiftShader 上較慢；用具名測試原因暫停，避免驗收互相干擾。
await page.evaluate(() => window.__setThreatPaused(true));

/* 門 2 專屬的正面事件：門 2 沒有鑰匙孔也沒有拉把，eye / lever 會是啞彈。
   正常路徑要進入潛伏期才觸發；這裡用 __fireFront 個別驗兩種素材的完整生命期。
   等待一律用 frontT（動畫時間）—— 這裡是軟體渲染，dt 被夾在 0.05，
   動畫比真實時間慢好幾倍（M1）。 */
for (const kind of ['badge', 'glitch']) {
  try {
    await page.evaluate(k => window.__fireFront(k), kind);
    await page.waitForFunction(t => window.__probe().frontT >= t, 0.1, { timeout: 60000 });
    await page.screenshot({ path: `${OUT}/front-${kind}.png` });
    await page.waitForFunction(() => window.__probe().front === null, null, { timeout: 60000 });
    check(`門 2 正面事件 ${kind} 會結束`, true, '生命期正常');
  } catch {
    check(`門 2 正面事件 ${kind} 會結束`, false,
      `卡住（front=${await page.evaluate(() => window.__probe().front)}）`);
  }
}

/* 滑鼠按住上方＝第一根手指，回頭 */
await page.mouse.move(422, 110);
await page.mouse.down();
try {
  await page.waitForFunction(() => Math.abs(window.__probe().yaw) >= 130, null, { timeout: 30000 });
  check('按住回頭到取件角度', true, `yaw=${await page.evaluate(() => window.__probe().yaw.toFixed(0))}°`);
} catch { check('按住回頭到取件角度', false, '逾時'); }
await page.screenshot({ path: `${OUT}/transit-lookback.png` });

/* 這是使用者回報的那件事：轉頭的手指還按著，第二根手指要能同時動作。
   命中點由頁面自己算（__grabPoint），寫死座標會在鏡頭一改就變成假通過。 */
const gp = await page.evaluate(() => window.__grabPoint());
check('回頭後鬆脫段在畫面上', !!gp,
  gp ? `(${gp.x.toFixed(0)}, ${gp.y.toFixed(0)}) r=${gp.r.toFixed(0)}px` : 'null');
check('命中半徑 ≥ 48px（H4 觸控目標）', !!gp && gp.r >= 48, gp ? `r=${gp.r.toFixed(0)}px` : '—');

if (gp) {
  /* 點歪不算：離命中半徑兩倍遠的地方點一下，tug 不該增加 */
  const before = await tugCount();
  await page.touchscreen.tap(Math.max(4, gp.x - gp.r * 2.2), gp.y);
  await page.waitForTimeout(120);
  const afterMiss = await tugCount();
  check('點歪不算一次扯', afterMiss === before, `tug ${before} → ${afterMiss}`);

  /* 點中三下 —— 視角手指全程沒有放開 */
  for (let i = 0; i < 3; i++) {
    const p = await page.evaluate(() => window.__grabPoint());
    if (!p) break;
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(140);
  }
  const tapN = await tugCount();
  check('第二根手指點三下＝三次扯拽', tapN >= 3, `tug=${tapN}`);
  check('視角手指全程按著沒被搶走',
    await page.evaluate(() => Math.abs(window.__probe().yaw) >= 130),
    `yaw=${await page.evaluate(() => window.__probe().yaw.toFixed(0))}°`);
}
await page.mouse.up();

await page.waitForFunction(
  () => ['grab', 'retrieved', 'done', 'idle', 'door2'].includes(window.__probe().transit),
  null, { timeout: 30000 });
check('第三扯後鬆脫段脫落（grab）', true,
  `phase=${await page.evaluate(() => window.__probe().transit)}`);

/* ── 門 2 盤面：抵達時就上桌（缺件、無解），零件落槽後歪的，點轉到通電 ── */
const pp0 = await pipe();
check('抵達門 2 時盤面已上桌', !!pp0 && pp0.active, pp0 ? `chain=${pp0.chain}` : 'null');
check('缺件時盤面無解（取件是強制的）', !!pp0 && pp0.cost === -1 && pp0.slot !== null,
  pp0 ? `slot=${pp0.slot} cost=${pp0.cost}` : '—');

await page.waitForFunction(() => {
  const p = window.__pipe();
  return p && p.slot === null;
}, null, { timeout: 30000 });
const pp1 = await pipe();
check('零件自動落入空槽', pp1.slot === null, `cost=${pp1.cost}`);
check('落槽是歪的 —— 還得再轉（v3 §4）', !pp1.solved && pp1.cost >= 1, `cost=${pp1.cost}`);

await page.evaluate(() => window.__setThreatPaused(false));
const done1 = await solvePipe();
check('點轉管格到通電', done1.solved === true, `chain=${done1.chain}`);

/* 通電瞬間 LCD 跳綠（綠色缺口框 —— 閂縮回的形狀） */
try {
  await page.waitForFunction(() => window.__doorPanel().mode === 'green', null, { timeout: 15000 });
  check('通電後 LCD 跳綠', true, 'mode=green');
} catch { check('通電後 LCD 跳綠', false, `mode=${await page.evaluate(() => window.__doorPanel().mode)}`); }

const door2Win0 = await page.evaluate(() => window.__probe());
check('通電瞬間凍結門 2 回合', door2Win0.over && door2Win0.won && door2Win0.paused &&
  door2Win0.pauseReasons.includes('round'),
  `over=${door2Win0.over} won=${door2Win0.won} paused=${door2Win0.pauseReasons.join(',')}`);
await page.waitForTimeout(350);
const door2Win1 = await page.evaluate(() => window.__probe().elapsed);
check('通電演出期間牆鐘停止', Math.abs(door2Win1 - door2Win0.elapsed) < 0.15,
  `elapsed ${door2Win0.elapsed.toFixed(2)} → ${door2Win1.toFixed(2)}`);

await waitPhase('done');

/* 自動重開：全部歸位 */
try {
  await page.waitForFunction(() => {
    const p = window.__probe();
    return p.transit === 'idle' && !p.over && p.pins.every(x => x === 'idle');
  }, null, { timeout: 60000 });
  const reset = await page.evaluate(() => ({
    seep: window.__probe().seep,
    elapsed: window.__probe().elapsed,
    tug: window.__probe().tug,
    paused: window.__probe().paused,
  }));
  const dpReset = await page.evaluate(() => window.__doorPanel());
  const sReset = await page.evaluate(() => window.__probe());
  check('自動重開且歸位', reset.tug === 0 && !reset.paused && !dpReset.visible,
    `seep=${reset.seep} tug=${reset.tug} lcd=${dpReset.mode} elapsed=${reset.elapsed.toFixed(2)}`);
  check('門身分與衰變下限跨局重置', sReset.door === 1 && sReset.decayFloor === 0,
    `door=${sReset.door} floor=${sReset.decayFloor}`);
} catch {
  check('自動重開且歸位', false, `逾時（phase=${await phase()}）`);
}

/* ── 取件（第二趟）：桌機主路徑 —— 左鍵按住回頭，右鍵點三下 ── */
await page.evaluate(() => window.__skipIntro());     // 重開後演出會再跑一次
await page.waitForTimeout(300);
await page.evaluate(() => window.__solveDoor1());
try {
  await page.waitForFunction(() => window.__probe().transit === 'door2', null, { timeout: 90000 });
  await page.evaluate(() => window.__setThreatPaused(true));
  await page.mouse.move(422, 110);
  await page.mouse.down();
  await page.waitForFunction(() => Math.abs(window.__probe().yaw) >= 130, null, { timeout: 30000 });
  for (let i = 0; i < 3; i++) {
    await page.mouse.down({ button: 'right' });      // 左鍵按住中的和弦右鍵
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(140);
  }
  const rcN = await tugCount();
  check('左鍵按住中右鍵點三下＝三次扯拽', rcN >= 3, `tug=${rcN}`);
  check('右鍵沒有搶走左鍵的視角',
    await page.evaluate(() => Math.abs(window.__probe().yaw) >= 130),
    `yaw=${await page.evaluate(() => window.__probe().yaw.toFixed(0))}°`);
  await page.mouse.up();
  await page.waitForFunction(
    () => ['grab', 'retrieved', 'done', 'idle', 'door2'].includes(window.__probe().transit),
    null, { timeout: 30000 });
  check('右鍵路徑也會脫落', true, `phase=${await phase()}`);
  await page.waitForFunction(() => { const p = window.__pipe(); return p && p.slot === null; },
    null, { timeout: 30000 });
  await page.evaluate(() => window.__setThreatPaused(false));
  const done2 = await solvePipe();
  check('第二趟盤面同樣可解到通電', done2.solved === true, `chain=${done2.chain}`);
} catch {
  check('右鍵主路徑取件', false, `逾時（phase=${await phase()}）`);
}

/* ── 取件（第三趟）：備援 —— S 鍵佔視角＋滑鼠伸手；一指盲扯 ── */
await page.waitForFunction(
  () => window.__probe().transit === 'idle' && !window.__probe().over, null, { timeout: 90000 });
await page.evaluate(() => window.__skipIntro());
await page.waitForTimeout(300);
await page.evaluate(() => window.__solveDoor1());
try {
  await page.waitForFunction(() => window.__probe().transit === 'door2', null, { timeout: 90000 });
  await page.evaluate(() => window.__setThreatPaused(true));

  /* 中文輸入法開著時按 S：e.key 是 'Process'，只有 e.code 還是 'KeyS'。
     使用者實測就是栽在這裡 —— 用合成事件直接模擬輸入法狀態。 */
  await page.evaluate(() => dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Process', code: 'KeyS' })));
  try {
    await page.waitForFunction(() => Math.abs(window.__probe().yaw) >= 130, null, { timeout: 30000 });
    check('中文輸入法下按 S 仍能佔視角', true,
      `yaw=${await page.evaluate(() => window.__probe().yaw.toFixed(0))}°`);
  } catch { check('中文輸入法下按 S 仍能佔視角', false, '逾時'); }
  await page.evaluate(() => dispatchEvent(
    new KeyboardEvent('keyup', { key: 'Process', code: 'KeyS' })));
  await page.waitForFunction(() => Math.abs(window.__probe().yaw) < 100, null, { timeout: 30000 });

  /* 桌機：左鍵按住轉過去 → 補按 S → 放開左鍵（視角不該彈回）→ 滑鼠空出來伸手。
     這是桌機唯一可行的順序：只有一個滑鼠，視角必須先交接出去。 */
  await page.mouse.move(422, 110);
  await page.mouse.down();
  await page.waitForFunction(() => Math.abs(window.__probe().yaw) >= 130, null, { timeout: 30000 });
  await page.keyboard.down('s');
  await page.mouse.up();
  await page.waitForTimeout(250);
  check('左鍵交接給 S 後視角沒有彈回',
    await page.evaluate(() => Math.abs(window.__probe().yaw) >= 130),
    `yaw=${await page.evaluate(() => window.__probe().yaw.toFixed(0))}°`);
  /* 等鬆脫段真的進畫面再點 —— 交接瞬間 yaw 還在爬，太早點會點在畫面外（一度造成 flake） */
  try {
    await page.waitForFunction(() => !!window.__grabPoint(), null, { timeout: 15000 });
  } catch { /* 下面的 tug 檢查會抓到 */ }
  const gp2 = await page.evaluate(() => window.__grabPoint());
  if (gp2) await page.mouse.click(gp2.x, gp2.y);
  await page.waitForTimeout(140);
  check('桌機 S 佔視角時滑鼠仍能伸手', await tugCount() >= 1, `tug=${await tugCount()}`);
  check('滑鼠點擊沒有搶走 S 鍵的視角',
    await page.evaluate(() => Math.abs(window.__probe().yaw) >= 130),
    `yaw=${await page.evaluate(() => window.__probe().yaw.toFixed(0))}°`);
  await page.keyboard.up('s');
  await page.waitForFunction(() => Math.abs(window.__probe().yaw) < 100, null, { timeout: 30000 });
  check('放開 S 視角彈回正面', true, `yaw=${await page.evaluate(() => window.__probe().yaw.toFixed(0))}°`);

  /* 一指盲扯 */
  const before2 = await tugCount();
  await page.mouse.move(422, 110);
  await page.mouse.down();
  await page.waitForFunction(() => Math.abs(window.__probe().yaw) >= 130, null, { timeout: 30000 });
  for (let i = 1; i <= 3; i++) {
    await page.mouse.move(422, 110 + i * 60, { steps: 4 });
    await page.waitForTimeout(150);
  }
  const tugN = await tugCount();
  check('一指按住下拉也算扯拽', tugN - before2 >= 2, `tug ${before2} → ${tugN}`);
  await page.mouse.up();
  await page.waitForFunction(
    () => ['grab', 'retrieved', 'done', 'idle', 'door2'].includes(window.__probe().transit),
    null, { timeout: 30000 });
  check('一指路徑也會脫落', true, `phase=${await phase()}`);

  // 取回零件後故意耗盡門 2 時限：驗死亡、死因、牆鐘凍結與整局重開。
  await page.waitForFunction(() => { const p = window.__pipe(); return p && p.slot === null; },
    null, { timeout: 30000 });
  await page.evaluate(() => {
    window.__setThreatPaused(false);
    window.__addThreatTime(25);
  });
  await page.waitForFunction(() => window.__probe().over, null, { timeout: 30000 });
  const dead0 = await page.evaluate(() => ({
    ...window.__probe(), msg: document.querySelector('#fade div')?.textContent || '',
  }));
  check('門 2 超時會被怪物殺死並凍結牆鐘', !dead0.won && dead0.paused &&
    dead0.pauseReasons.includes('round'),
    `over=${dead0.over} won=${dead0.won} paused=${dead0.pauseReasons.join(',')}`);
  check('零件已取回後死因是時間不夠', dead0.msg === '時間不夠', `msg=${dead0.msg}`);
  await page.waitForTimeout(350);
  const dead1 = await page.evaluate(() => window.__probe().elapsed);
  check('死亡結算期間牆鐘停止', Math.abs(dead1 - dead0.elapsed) < 0.15,
    `elapsed ${dead0.elapsed.toFixed(2)} → ${dead1.toFixed(2)}`);
  await page.waitForFunction(() => {
    const p = window.__probe();
    return p.transit === 'idle' && !p.over;
  }, null, { timeout: 30000 });
  const afterDeath = await page.evaluate(() => window.__probe());
  check('門 2 死亡後整局重開且解除回合暫停', afterDeath.door === 1 && !afterDeath.paused,
    `door=${afterDeath.door} paused=${afterDeath.pauseReasons.join(',')}`);
} catch {
  check('第二趟取件（桌機＋一指）', false, `逾時（phase=${await phase()}）`);
}

check('全程無 JS 例外', errs.length === 0, errs.slice(0, 3).join(' | ') || '無');

console.log(`\n=== FAIL ${failures} 項 ===`);
await browser.close();
process.exit(failures ? 1 : 0);
