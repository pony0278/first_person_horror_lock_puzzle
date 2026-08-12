/* CG6 — CrazyGames submission readiness probe.
 *
 * Browser collection is deliberately tiny; the classification helpers stay pure
 * so CI can lock the contract without reintroducing slow viewport automation.
 */

export const CRAZYGAMES_DESKTOP_VIEWPORTS = Object.freeze([
  Object.freeze({ width: 821, height: 462, label: 'iframe-small' }),
  Object.freeze({ width: 907, height: 510, label: 'iframe-standard' }),
  Object.freeze({ width: 1077, height: 606, label: 'iframe-wide' }),
  Object.freeze({ width: 1216, height: 684, label: 'iframe-large' }),
  Object.freeze({ width: 1280, height: 720, label: 'fullscreen-720p' }),
  Object.freeze({ width: 1366, height: 768, label: 'fullscreen-laptop' }),
  Object.freeze({ width: 1536, height: 864, label: 'fullscreen-864p' }),
  Object.freeze({ width: 1920, height: 1080, label: 'fullscreen-1080p' }),
]);

const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u;
const result = (status, detail) => Object.freeze({ status, detail });

export const hasHanText = value => HAN.test(String(value ?? ''));

export function nearestCrazyGamesViewport(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  let best = CRAZYGAMES_DESKTOP_VIEWPORTS[0];
  let distance = Number.POSITIVE_INFINITY;
  for (const target of CRAZYGAMES_DESKTOP_VIEWPORTS) {
    const next = Math.hypot(w - target.width, h - target.height);
    if (next < distance) { best = target; distance = next; }
  }
  return { ...best, distance: +distance.toFixed(2) };
}

function withinViewport(rect, width, height, tolerance = 1) {
  if (!rect) return true;
  return rect.left >= -tolerance && rect.top >= -tolerance &&
    rect.right <= width + tolerance && rect.bottom <= height + tolerance;
}

export function assessCrazyGamesSubmissionFrame({
  width = 0,
  height = 0,
  dpr = 1,
  lang = '',
  title = '',
  scrollWidth = width,
  scrollHeight = height,
  playerTexts = [],
  cueRect = null,
  dumpRect = null,
  dumpVisible = true,
  platformQa = null,
} = {}) {
  const nearest = nearestCrazyGamesViewport(width, height);
  const exactTarget = nearest.distance <= 2;
  const english = String(lang).toLowerCase().startsWith('en');
  const leaked = playerTexts.filter(text => hasHanText(text));
  const overflow = Number(scrollWidth) > Number(width) + 1 ||
    Number(scrollHeight) > Number(height) + 1;
  const clippedCue = !withinViewport(cueRect, width, height);
  const clippedDump = dumpVisible && !withinViewport(dumpRect, width, height);
  const dumpHit = !dumpVisible || !dumpRect ||
    (dumpRect.width >= 44 && dumpRect.height >= 44);

  const checks = Object.freeze({
    english: english && leaked.length === 0
      ? result('PASS', 'Player-facing UI is English')
      : result('FAIL', !english
        ? `Document lang is ${lang || '(missing)'}`
        : `Han text remains visible: ${leaked.join(' | ')}`),
    title: String(title).trim()
      ? result('PASS', String(title))
      : result('FAIL', 'Document title is empty'),
    viewport: exactTarget
      ? result('PASS', `${width}×${height} matches ${nearest.label}`)
      : result('WAIT', `${width}×${height}; nearest target is ${nearest.width}×${nearest.height}`),
    dpr: Math.abs(Number(dpr) - 1) <= 0.01
      ? result('PASS', 'devicePixelRatio = 1')
      : result('WAIT', `devicePixelRatio = ${dpr}; repeat readability QA at DPR 1`),
    overflow: !overflow
      ? result('PASS', 'No document overflow')
      : result('FAIL', `Document scroll size ${scrollWidth}×${scrollHeight} exceeds viewport`),
    clipping: !clippedCue && !clippedDump
      ? result('PASS', 'Player controls and turn cue stay inside the viewport')
      : result('FAIL', `${clippedCue ? 'turn cue clipped; ' : ''}${clippedDump ? 'vent control clipped' : ''}`.trim()),
    touchTarget: dumpHit
      ? result('PASS', 'Primary Door 1 vent control keeps a 44px hit target')
      : result('FAIL', `Vent control is only ${dumpRect?.width ?? 0}×${dumpRect?.height ?? 0}px`),
    platform: !platformQa
      ? result('WAIT', 'Run after CG5 __crazyGamesQA() becomes available')
      : platformQa.overall === 'FAIL'
        ? result('FAIL', 'CG5 platform QA reports FAIL')
        : platformQa.overall === 'PASS'
          ? result('PASS', 'CG5 platform QA reports PASS')
          : result('WAIT', 'CG5 platform QA still has pending checks'),
  });

  const statuses = Object.values(checks).map(check => check.status);
  const overall = statuses.includes('FAIL') ? 'FAIL' : statuses.includes('WAIT') ? 'WAIT' : 'PASS';
  return Object.freeze({ phase: 'CG6', overall, nearestViewport: nearest, checks });
}

function rectOf(node) {
  if (!node || typeof node.getBoundingClientRect !== 'function') return null;
  const rect = node.getBoundingClientRect();
  return {
    left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
    width: rect.width, height: rect.height,
  };
}

export function buildCrazyGamesSubmissionQaReport(root = globalThis) {
  const doc = root?.document;
  if (!doc) return assessCrazyGamesSubmissionFrame();
  const turnCue = doc.getElementById('turnCue');
  const dump = doc.getElementById('dump');
  const fadeText = doc.querySelector('#fade div');
  const haltText = doc.querySelector('#halt p');
  const dumpStyle = dump && root.getComputedStyle ? root.getComputedStyle(dump) : null;
  const platformQa = typeof root.__crazyGamesQA === 'function' ? root.__crazyGamesQA() : null;

  return assessCrazyGamesSubmissionFrame({
    width: root.innerWidth,
    height: root.innerHeight,
    dpr: root.devicePixelRatio,
    lang: doc.documentElement?.lang,
    title: doc.title,
    scrollWidth: doc.documentElement?.scrollWidth,
    scrollHeight: doc.documentElement?.scrollHeight,
    playerTexts: [turnCue?.textContent, dump?.textContent, fadeText?.textContent, haltText?.textContent]
      .filter(Boolean),
    cueRect: rectOf(turnCue),
    dumpRect: rectOf(dump),
    dumpVisible: dumpStyle?.display !== 'none',
    platformQa,
  });
}

export function installCrazyGamesSubmissionQa(root = globalThis) {
  if (!root) return false;
  root.__crazyGamesSubmissionQA = () => buildCrazyGamesSubmissionQaReport(root);
  return true;
}
