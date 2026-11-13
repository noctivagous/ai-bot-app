// R-batch probe — the R1–R9 affordance tranche (docs/FEATURE-MAP.md),
// driven against the production build in mock mode (vite preview,
// ?adapter=mock), same harness as probe-refinements:
//   R1 caret present on the adapter cluster; flips (class + computed
//      transform) with the connection popover's open state
//   R2 capabilities render as readout rows (no chip class anywhere on
//      them); tags compute to 3px radius, chips to 9px
//   R4 popover takes focus on open (close button); Escape closes it
//      and focus returns to the lamp-cluster
//   R5 popover check rows show plain state words ("Pass · required",
//      never "pass · req"); the degraded strip names lost capabilities
//      friendly ("Approvals, Activity"), never raw keys
//   R6 Ctrl+K focuses search from anywhere; typing filters the table;
//      the clear button appears only with a query and clears it;
//      Escape while focused clears the query
//   R8 drawn scrollbar: hidden when .main does not overflow; shown
//      when it does; thumb drag scrolls; track click jumps
//   R9 progress fill has no animated ::after (sheen removed); the
//      streaming bubble's dot computes animation-name "pulse"
//   no app console errors
//
// Run: node scripts/probe-rbatch.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chromium,
  HEADLESS_SHELL,
  launchAppPage,
  makeReporter,
  startPreview,
  waitForPhase,
  watchConsole,
} from './probe-lib.mjs';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const report = makeReporter('r-batch probe (R1–R9)');

const stopPreview = await startPreview(PORT, root);
const browser = await chromium.launch({ executablePath: HEADLESS_SHELL, headless: true });
try {
  const { page } = await launchAppPage(browser, `${BASE}/?adapter=mock`);
  const consoleErrors = watchConsole(page, report);
  await waitForPhase(page, 'ready');
  report.check('boot walk reaches ready', true);

  // ── R9 (early, on the boot Board): progress fill is static ────────
  const progress = await page.evaluate(() => {
    const i = document.querySelector('.progress i');
    if (!i) return null;
    const after = getComputedStyle(i, '::after');
    return { fillAnim: getComputedStyle(i).animationName, afterContent: after.content, afterAnim: after.animationName };
  });
  report.check(
    'R9: progress fill carries no animation and no ::after sheen',
    progress !== null && progress.fillAnim === 'none' && progress.afterContent === 'none' && progress.afterAnim === 'none',
    JSON.stringify(progress),
  );

  // ── R1: caret flips with the popover ──────────────────────────────
  const caretClosed = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="adapter-caret"]');
    return c ? { cls: c.className, transform: getComputedStyle(c).transform } : null;
  });
  report.check(
    'R1: caret present on the cluster, unflipped while the popover is closed',
    caretClosed !== null && !caretClosed.cls.includes('open') && caretClosed.transform === 'none',
    JSON.stringify(caretClosed),
  );
  await page.click('[data-testid="lamp-cluster"]');
  await page.waitForSelector('.popover');
  await page.waitForTimeout(250); // let the 120ms flip transition settle
  const caretOpen = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="adapter-caret"]');
    return c ? { cls: c.className, transform: getComputedStyle(c).transform } : null;
  });
  report.check(
    'R1: caret flips (open class + rotated transform) while the popover is open',
    caretOpen !== null && caretOpen.cls.includes('open') && caretOpen.transform !== 'none',
    JSON.stringify(caretOpen),
  );

  // ── R4: focus enters the popover on open ──────────────────────────
  const focusIn = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  report.check('R4: focus moves into the popover on open (close button)', focusIn === 'Close connection panel', String(focusIn));

  // ── R2 + R5: capability rows, plain state words ───────────────────
  const popoverFacts = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid="capability-row"]')];
    const states = [...document.querySelectorAll('.popover .check-row .cstate')].map((s) => s.textContent?.trim() ?? '');
    return {
      capRows: rows.length,
      capRowsWithChipClass: rows.filter((r) => r.classList.contains('chip')).length,
      capRowSample: rows[0]?.textContent?.trim() ?? null,
      states,
    };
  });
  report.check(
    'R2: capabilities render as readout rows, none wearing the chip class',
    popoverFacts.capRows >= 5 && popoverFacts.capRowsWithChipClass === 0,
    JSON.stringify(popoverFacts),
  );
  report.check(
    'R5: check rows show plain state words (Pass/Warning/… · required), never the mono shorthand',
    popoverFacts.states.length > 0 &&
      popoverFacts.states.every((s) => /^(Pass|Fail|Warning|Pending|Skipped)( · required)?$/.test(s)) &&
      popoverFacts.states.some((s) => s.includes('required')),
    JSON.stringify(popoverFacts.states),
  );

  // ── R4: Escape closes; focus returns to the cluster ───────────────
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.popover'));
  const focusBack = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  report.check('R4: Escape closes the popover and focus returns to the lamp-cluster', focusBack === 'lamp-cluster', String(focusBack));

  // ── R6: search well ───────────────────────────────────────────────
  await page.locator('.seg button', { hasText: 'Conversations' }).click();
  await page.waitForSelector('[data-testid^="conv-row-"]');
  const totalRows = await page.evaluate(() => document.querySelectorAll('[data-testid^="conv-row-"]').length);
  await page.keyboard.press('Control+k');
  const focusSearch = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  report.check('R6: Ctrl+K focuses the search input from anywhere', focusSearch === 'search-input', String(focusSearch));
  await page.keyboard.type('nib');
  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-testid^="conv-row-"]').length < n,
    totalRows,
  );
  const filteredRows = await page.evaluate(() => document.querySelectorAll('[data-testid^="conv-row-"]').length);
  report.check('R6: typing filters the conversations table', filteredRows >= 1 && filteredRows < totalRows, `rows ${totalRows} -> ${filteredRows}`);
  const clearShown = await page.$('[data-testid="search-clear"]');
  report.check('R6: clear button appears once the query is non-empty', clearShown !== null);
  await page.click('[data-testid="search-clear"]');
  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-testid^="conv-row-"]').length === n,
    totalRows,
  );
  const clearGone = await page.$('[data-testid="search-clear"]');
  report.check('R6: clear button empties the query (full table back) and disappears', clearGone === null);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('zzzz');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="conv-row-"]').length === 0);
  await page.keyboard.press('Escape');
  const queryAfterEsc = await page.evaluate(
    () => document.querySelector('[data-testid="search-input"]')?.value,
  );
  report.check('R6: Escape while focused clears the query', queryAfterEsc === '', String(queryAfterEsc));

  // ── R2: tag vs chip radius (computed) ─────────────────────────────
  const radii = await page.evaluate(() => {
    const tag = document.querySelector('.tag');
    const chip = document.querySelector('.chip');
    return {
      tag: tag ? getComputedStyle(tag).borderRadius : null,
      chip: chip ? getComputedStyle(chip).borderRadius : null,
    };
  });
  report.check('R2: tags compute to squared 3px, chips to pill 9px', radii.tag === '3px' && radii.chip === '9px', JSON.stringify(radii));

  // ── R8: bar hidden when .main does not overflow ───────────────────
  await page.keyboard.press('Control+k');
  await page.keyboard.type('zzzz');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="conv-row-"]').length === 0);
  await page.waitForTimeout(300);
  const barHidden = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="main-drawn-bar"]');
    const main = document.querySelector('.main');
    return {
      display: bar ? getComputedStyle(bar).display : null,
      overflows: main ? main.scrollHeight - main.clientHeight > 1 : null,
    };
  });
  report.check(
    'R8: drawn bar hidden while .main does not overflow',
    barHidden.display === 'none' && barHidden.overflows === false,
    JSON.stringify(barHidden),
  );
  await page.keyboard.press('Escape');

  // ── R5: degraded strip names capabilities friendly ────────────────
  await page.click('[data-testid="lamp-cluster"]');
  await page.waitForSelector('.popover');
  await page.locator('.scenario-grid button', { hasText: 'degraded' }).click();
  await waitForPhase(page, 'degraded');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="conv-row-conv-main"]');
  await page.locator('[data-testid="conv-row-conv-main"] button', { hasText: 'Open' }).first().click();
  await page.waitForSelector('[data-testid="chat-panel"]');
  const stripText = await page.evaluate(
    () => document.querySelector('[data-testid="chat-panel"] .strip')?.textContent?.trim() ?? '',
  );
  report.check(
    'R5: degraded strip lists lost capabilities by friendly name, not raw keys',
    stripText.includes('lost capabilities: Approvals, Activity') && !stripText.includes('approvals, activity'),
    stripText,
  );
  await page.locator('[data-testid="chat-panel"] button', { hasText: 'Close' }).click();
  await page.click('[data-testid="lamp-cluster"]');
  await page.waitForSelector('.popover');
  await page.locator('.scenario-grid button', { hasText: 'happy' }).click();
  await waitForPhase(page, 'ready');
  await page.keyboard.press('Escape');
  report.check('scenario restored to happy/ready', true);

  // ── R9: the streaming bubble's dot pulses ─────────────────────────
  await page.waitForSelector('[data-testid="conv-row-conv-main"]');
  await page.locator('[data-testid="conv-row-conv-main"] button', { hasText: 'Open' }).first().click();
  await page.waitForSelector('[data-testid="chat-panel"]');
  await page.fill('[data-testid="composer"]', 'status please');
  await page.click('[data-testid="send-btn"]');
  await page.waitForFunction(
    () => {
      const dot = document.querySelector('.msg.bot .pulse');
      return dot !== null && getComputedStyle(dot).animationName === 'pulse';
    },
    { timeout: 10_000 },
  );
  report.check('R9: the streaming bubble dot computes animation-name "pulse" while streaming', true);
  await page.waitForFunction(
    () => document.querySelector('[data-testid="chat-body"]')?.textContent?.includes('I received') ?? false,
    { timeout: 15_000 },
  );
  await page.locator('[data-testid="chat-panel"] button', { hasText: 'Close' }).click();

  report.check('no app console errors (main page)', consoleErrors.length === 0, consoleErrors.join(' | '));

  // ── R8: shown + drag + track-click, on a short viewport ───────────
  const { page: page2 } = await launchAppPage(browser, `${BASE}/?adapter=mock`, { width: 1100, height: 550 });
  const consoleErrors2 = watchConsole(page2, report);
  await waitForPhase(page2, 'ready');
  await page2.waitForTimeout(400);
  const barShown = await page2.evaluate(() => {
    const bar = document.querySelector('[data-testid="main-drawn-bar"]');
    const thumb = document.querySelector('[data-testid="main-drawn-thumb"]');
    const main = document.querySelector('.main');
    return {
      display: bar ? getComputedStyle(bar).display : null,
      thumbH: thumb ? thumb.getBoundingClientRect().height : 0,
      overflows: main ? main.scrollHeight - main.clientHeight > 1 : null,
      scrollTop: main?.scrollTop ?? -1,
    };
  });
  report.check(
    'R8: drawn bar shown when .main overflows, thumb at least 28px',
    barShown.display === 'block' && barShown.overflows === true && barShown.thumbH >= 28 && barShown.scrollTop === 0,
    JSON.stringify(barShown),
  );
  const thumbBox = await page2.locator('[data-testid="main-drawn-thumb"]').boundingBox();
  if (!thumbBox) throw new Error('drawn thumb has no box');
  await page2.mouse.move(thumbBox.x + thumbBox.width / 2, thumbBox.y + thumbBox.height / 2);
  await page2.mouse.down();
  await page2.mouse.move(thumbBox.x + thumbBox.width / 2, thumbBox.y + thumbBox.height / 2 + 160, { steps: 8 });
  await page2.mouse.up();
  await page2.waitForTimeout(200);
  const afterDrag = await page2.evaluate(() => document.querySelector('.main')?.scrollTop ?? -1);
  report.check('R8: dragging the thumb scrolls the region', afterDrag > 100, `scrollTop=${afterDrag}`);
  await page2.evaluate(() => {
    const main = document.querySelector('.main');
    if (main) main.scrollTop = 0;
  });
  await page2.waitForTimeout(200);
  const barBox = await page2.locator('[data-testid="main-drawn-bar"]').boundingBox();
  if (!barBox) throw new Error('drawn bar has no box');
  await page2.mouse.click(barBox.x + barBox.width / 2, barBox.y + barBox.height - 6);
  await page2.waitForTimeout(200);
  const jump = await page2.evaluate(() => {
    const main = document.querySelector('.main');
    if (!main) return { frac: -1 };
    return { frac: main.scrollTop / (main.scrollHeight - main.clientHeight) };
  });
  report.check('R8: clicking the track jumps most of the way to the end', jump.frac > 0.6, `frac=${jump.frac.toFixed(2)}`);
  report.check('no app console errors (short-viewport page)', consoleErrors2.length === 0, consoleErrors2.join(' | '));
} finally {
  await browser.close();
  stopPreview();
}
process.exit(report.summary() ? 0 : 1);
