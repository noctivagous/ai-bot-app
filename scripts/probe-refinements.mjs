// Refinements probe — the first UI-refinement tranche (FEATURE-MAP
// decisions D1/D2/D4), driven against the production build in mock mode
// (vite preview, ?adapter=mock), same harness as probe-slice2:
//   1. D2: the Board shows the ACTIVITY umbrella heading, and the
//      NEEDS YOU / RUNNING NOW zones live under it (PROJECTS does not)
//   2. D1: in a chat, Send is ABSENT with an empty draft, materialises
//      when text is typed, and disappears when the draft is cleared
//   3. D4: a mock "interrupt" send streams a partial and finalizes it
//      WITH the "Interrupted" marker chip; a following normal reply
//      finalizes WITHOUT one (marker count stays exactly 1)
//   4. D4 board half: the interrupted reply's activity conclusion files
//      a Recently Finished entry carrying the outcome "Interrupted"
//   5. no app console errors
//
// Run: node scripts/probe-refinements.mjs

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
const report = makeReporter('refinements probe (D1/D2/D4)');

const stopPreview = await startPreview(PORT, root);
const browser = await chromium.launch({ executablePath: HEADLESS_SHELL, headless: true });
try {
  const { page } = await launchAppPage(browser, `${BASE}/?adapter=mock`);
  const consoleErrors = watchConsole(page, report);

  await waitForPhase(page, 'ready');
  report.check('boot walk reaches ready', true);

  // 1. D2 — the Activity umbrella over the live zones
  const umbrella = await page.evaluate(() => {
    const head = document.querySelector('[data-testid="activity-umbrella"]');
    const section = head?.closest('section');
    const text = section?.textContent ?? '';
    return {
      head: head?.textContent?.trim() ?? null,
      hasSubline: text.includes('desk’s grouping of Muse’s Activity'),
      hasNeeds: text.includes('NEEDS YOU'),
      hasRunning: text.includes('RUNNING NOW'),
      hasProjects: text.includes('PROJECTS AT A GLANCE'),
    };
  });
  report.check('D2: ACTIVITY umbrella heading present', umbrella.head === 'ACTIVITY', JSON.stringify(umbrella));
  report.check(
    'D2: umbrella groups NEEDS YOU + RUNNING NOW (not Projects), with the desk-grouping subline',
    umbrella.hasNeeds && umbrella.hasRunning && !umbrella.hasProjects && umbrella.hasSubline,
  );

  // open Main chat from the Conversations table (as in probe-slice4)
  await page.locator('.seg button', { hasText: 'Conversations' }).click();
  await page.waitForSelector('[data-testid="conv-row-conv-main"]');
  await page.locator('[data-testid="conv-row-conv-main"] button', { hasText: 'Open' }).first().click();
  await page.waitForSelector('[data-testid="chat-panel"]');
  report.check('chat panel opens (Main chat)', true);

  // 2. D1 — Send materialises on text, and only on text
  const sendAtRest = await page.$('[data-testid="send-btn"]');
  report.check('D1: no Send button with an empty draft', sendAtRest === null);
  await page.fill('[data-testid="composer"]', 'a draft appears');
  await page.waitForSelector('[data-testid="send-btn"]', { timeout: 5_000 });
  report.check('D1: Send materialises when text is typed', true);
  await page.fill('[data-testid="composer"]', '');
  await page.waitForFunction(() => !document.querySelector('[data-testid="send-btn"]'), { timeout: 5_000 });
  report.check('D1: Send disappears when the draft is cleared', true);

  // 3. D4 — the cut-short reply is marked; a normal reply is not
  await page.fill('[data-testid="composer"]', 'please interrupt this reply partway');
  await page.click('[data-testid="send-btn"]');
  await page.waitForSelector('[data-testid="interrupted-marker"]', { timeout: 10_000 });
  const markerText = await page.textContent('[data-testid="interrupted-marker"]');
  report.check('D4: interrupted final carries the "Interrupted" marker', markerText?.trim() === 'Interrupted', markerText?.trim());
  const bodyAfterCut = (await page.textContent('[data-testid="chat-body"]')) ?? '';
  report.check(
    'D4: the partial stands as the message (head streamed, tail never arrived)',
    bodyAfterCut.includes('the full answer that was on its way') && !bodyAfterCut.includes('follow-ups'),
  );

  await page.fill('[data-testid="composer"]', 'status please');
  await page.click('[data-testid="send-btn"]');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="chat-body"]')?.textContent?.includes('I received'),
    { timeout: 15_000 },
  );
  const markerCount = await page.evaluate(
    () => document.querySelectorAll('[data-testid="interrupted-marker"]').length,
  );
  report.check('D4: the normal reply that followed is unmarked (marker count still 1)', markerCount === 1, `count=${markerCount}`);

  // 4. D4 board half — Recently Finished carries the Interrupted outcome
  await page.locator('[data-testid="chat-panel"] button', { hasText: 'Close' }).click();
  await page.locator('.seg button', { hasText: 'Board' }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="recent-conv-main"]')
        ?.textContent?.includes('Interrupted') ?? false,
    { timeout: 10_000 },
  );
  report.check('D4: Recently Finished files the reply with outcome "Interrupted"', true);

  report.check('no app console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
} finally {
  await browser.close();
  stopPreview();
}
process.exit(report.summary() ? 0 : 1);
