// Slice 2 driven probe — mock events complete.
// Verifies against the production build (vite preview, ?adapter=mock):
//   1. boot walk → ready, popover checklist 10/10
//   2. the NEEDS YOU approval arrives via approval.request (adapter event)
//   3. Allow resolves THROUGH the adapter: the outcome system line lands in
//      the raising conversation's chat; the row clears; the decision
//      persists across reload even though the mock re-raises on reconnect
//   4. send streams a mock reply (unchanged slice-1 behaviour)
//   5. multitasking: AnSci finishes on its own (~62 s), footer 3 → 2
//   6. no app console errors

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
const report = makeReporter('slice 2 probe');

const stopPreview = await startPreview(PORT, root);
const browser = await chromium.launch({ executablePath: HEADLESS_SHELL, headless: true });
try {
  const { page } = await launchAppPage(browser, `${BASE}/?adapter=mock`);
  const consoleErrors = watchConsole(page, report);

  // 1. boot walk
  await waitForPhase(page, 'ready');
  report.check('boot walk reaches ready', true);
  await page.click('[data-testid="lamp-cluster"]');
  await page.waitForSelector('.popover');
  const popText = await page.textContent('.popover');
  report.check('popover checklist 10/10', /10\/10/.test(popText ?? ''));
  await page.click('[data-testid="lamp-cluster"]'); // close

  // 2. approval arrives via event (mock emits at ready + 800 ms)
  await page.waitForSelector('[data-testid="approval-row"]', { timeout: 15_000 });
  const approvalText = await page.textContent('[data-testid="approval-row"]');
  report.check('approval row present from approval.request', /Push NibGlider layout fix/.test(approvalText ?? ''));

  // footer starts at 3 running
  const footer0 = await page.textContent('[data-testid="footer-counts"]');
  report.check('footer shows 3 chats running', /3\s*chats running/.test(footer0 ?? ''), footer0?.trim());

  // 3. Allow (once — §2.12 scopes are offered) → adapter resolution →
  // system line in the NibGlider chat; decision log names the scope
  const alwaysBtn = await page.$('[data-testid="approval-always"]');
  report.check('approval offers scopes (Always allow button present)', !!alwaysBtn);
  await page.click('[data-testid="approval-allow"]');
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="approval-row"]'),
    { timeout: 10_000 },
  );
  report.check('approval row clears after Allow', true);
  const boardText = await page.textContent('main');
  report.check('decision log shows the chosen scope ("Allowed — once")', /Allowed — once/.test(boardText ?? ''));

  // open the NibGlider chat from the Running Now card (the Open button —
  // the card also has a Detail toggle since the activity-detail follow-up)
  await page.locator('[data-testid="job-conv-nibglider"] button', { hasText: 'Open' }).click();
  await page.waitForSelector('[data-testid="chat-panel"]');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="chat-body"]')?.textContent?.includes('Approval allowed'),
    { timeout: 10_000 },
  );
  report.check('approval outcome system line landed in the raising chat', true);

  // 4. send streams a reply in this chat
  await page.fill('[data-testid="composer"]', 'slice 2 probe message');
  await page.click('[data-testid="send-btn"]');
  await page.waitForSelector('[data-testid="streaming-msg"]', { timeout: 10_000 }).catch(() => null);
  await page.waitForFunction(
    () => document.querySelector('[data-testid="chat-body"]')?.textContent?.includes('Mock reply'),
    { timeout: 15_000 },
  );
  report.check('send streams a labelled mock reply', true);
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('[data-testid="chat-panel"] button', { hasText: 'Close' }).click();

  // 4b. job cards expand to the activity detail (ActivityPatch.detail)
  await page.click('[data-testid="job-expand-conv-nibglider"]');
  const detail = await page.textContent('[data-testid="job-detail-conv-nibglider"]');
  report.check('job card expands to "what it is doing" detail', /WHAT IT IS DOING/.test(detail ?? '') && (detail ?? '').length > 40, (detail ?? '').slice(0, 80));

  // 5. multitasking finish (AnSci completes at ~62 s of adapter time)
  await page.waitForSelector('[data-testid="finished-row"]', { timeout: 120_000 });
  const footer1 = await page.textContent('[data-testid="footer-counts"]');
  report.check('AnSci finished row appears in NEEDS YOU', true);
  report.check('footer drops to 2 chats running', /2\s*chats running/.test(footer1 ?? ''), footer1?.trim());

  // 5b. Recently Finished carries the outcome (project history, §2.10)
  const recent = await page.textContent('[data-testid="recent-conv-ansci"]');
  report.check('Recently Finished shows AnSci with its outcome', /grounded/.test(recent ?? ''), (recent ?? '').slice(0, 110));

  // 3b. reload: decision persists; the re-raised approval stays suppressed
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForPhase(page, 'ready');
  await page.waitForTimeout(4000); // connect walk + scripted re-raise window
  const rowAfterReload = await page.$('[data-testid="approval-row"]');
  report.check('approval stays resolved across reload', rowAfterReload === null);

  report.check('no app console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
} finally {
  await browser.close();
  stopPreview();
}
process.exit(report.summary() ? 0 : 1);
