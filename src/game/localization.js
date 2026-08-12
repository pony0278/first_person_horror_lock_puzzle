/* CG6 — CrazyGames submission English localization.
 *
 * Keep player-facing text behind one tiny boundary instead of editing every
 * Door 1/2/3 state machine. Developer/debug UI is intentionally excluded.
 */

const EXACT_EN = new Map([
  ['按住畫面 = 回頭　·　放開 = 轉回門鎖', 'HOLD VIEW = LOOK BACK · RELEASE = RETURN TO LOCK'],
  ['全部洩壓', 'VENT ALL'],
  ['畫面中斷了　·　正在等待恢復', 'RENDERING INTERRUPTED · WAITING TO RECOVER'],

  ['卡在假針太久', 'JAMMED ON THE FALSE PIN'],
  ['回頭看太多次', 'LOOKED BACK TOO LONG'],
  ['連續操作錯誤', 'TOO MANY INPUT ERRORS'],
  ['時間不夠', 'RAN OUT OF TIME'],
  ['備用保險絲也熔斷了', 'THE SPARE FUSE BURNED OUT'],
  ['你太晚去拿保險絲', 'YOU REACHED THE FUSE TOO LATE'],
  ['極限逃脫', 'LAST-SECOND ESCAPE'],
  ['逃脫成功', 'ESCAPED'],
  ['極限通電', 'POWER RESTORED AT THE LAST SECOND'],
  ['通電成功', 'POWER RESTORED'],

  ['斷電太久 —— 重新開始', 'POWER WAS OUT TOO LONG — RESTARTING'],
  ['保險絲到手 —— 門 2 施工中', 'FUSE SECURED — DOOR 2 INCOMPLETE'],

  ['先按來源缸 －　再按目標缸 ＋　·　拖曳環視', 'PRESS SOURCE TANK − · THEN TARGET TANK + · DRAG TO LOOK'],
  ['雙門閂已退回　·　拉下右側總閘桿', 'BOTH LATCHES RETRACTED · PULL THE MASTER LEVER'],
  ['防洪門升起中　·　盯住牠可短暫牽制', 'FLOODGATE RISING · KEEP IT IN SIGHT TO SLOW IT'],
  ['防洪門已開　·　向前衝', 'FLOODGATE OPEN · RUN'],
  ['牠在防洪門升起前追上了你', 'IT REACHED YOU BEFORE THE FLOODGATE OPENED'],
  ['牠在門檻前抓住了你', 'IT CAUGHT YOU AT THE THRESHOLD'],
  ['左側水波已逼到工作檯', 'THE LEFT-SIDE RIPPLE REACHED THE WORKBENCH'],
  ['後方鐵鏈停止 —— 牠已經抵達', 'THE REAR CHAIN STOPPED — IT HAS ARRIVED'],
  ['右側照明全滅 —— 牠已經抵達', 'THE RIGHT-SIDE LIGHTS DIED — IT HAS ARRIVED'],

  ['未完待續', 'TO BE CONTINUED'],
]);

const TANK_SOURCE = /^TANK\s+(\d+)\s+出口已開　·　選另一缸\s+＋$/;

export function translatePlayerText(value) {
  const text = String(value ?? '');
  const exact = EXACT_EN.get(text);
  if (exact) return exact;
  const tank = text.match(TANK_SOURCE);
  if (tank) return `TANK ${tank[1]} OUTLET OPEN · SELECT ANOTHER TANK +`;
  return text;
}

function translateNode(node) {
  if (!node) return;
  const next = translatePlayerText(node.textContent);
  if (next !== node.textContent) node.textContent = next;
}

function applyEnglishDocument(root) {
  const doc = root?.document ?? root;
  if (!doc?.documentElement) return false;

  doc.documentElement.lang = 'en';
  doc.title = 'First Person Horror Lock Puzzle';
  const turnCue = doc.getElementById('turnCue');
  const dump = doc.getElementById('dump');
  const fadeText = doc.querySelector('#fade div');
  const haltText = doc.querySelector('#halt p');
  [turnCue, dump, fadeText, haltText].forEach(translateNode);

  const Observer = root?.MutationObserver ?? globalThis.MutationObserver;
  if (typeof Observer !== 'function') return true;
  const watched = [turnCue, fadeText, haltText].filter(Boolean);
  if (!watched.length) return true;

  const observer = new Observer(records => {
    for (const record of records) translateNode(record.target);
  });
  watched.forEach(node => observer.observe(node, {
    childList: true,
    characterData: true,
    subtree: true,
  }));
  return true;
}

export function installEnglishPlayerUi(root = globalThis) {
  const doc = root?.document;
  if (!doc) return false;
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', () => applyEnglishDocument(root), { once: true });
    return true;
  }
  return applyEnglishDocument(root);
}
