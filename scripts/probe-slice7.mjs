// Slice 7 driven verification (MOCK half) — chat-driven dashboards.
// Default ?adapter=mock against `vite preview`. Checks:
//  INTENTS
//   1. Send "propose a session" in Main chat → the streamed/final text
//      in the chat contains NO intent fence or JSON; the final text is
//      the clean prose.
//   2. The webview intent opens the artifact viewer automatically with
//      "Chinese map + timeline outline".
//   3. Schedule view gains a "Proposed by chat" section with the
//      proposed entry — and md_schedule does NOT contain it yet
//      (manual-first: never auto-filed).
//   4. Accept → the entry is filed (Gantt + stored schedule), the
//      proposal is gone.
//   5. A second proposal, Rejected → discarded; schedule unchanged.
//  CONTROL PANEL
//   6. "Run layout review" → ack toast; the scripted burst runs on
//      conv-nibglider and its completion lands in Recently Finished
//      with the burst outcome.
//  RESOURCES
//   7. The Resources panel lists 4 monitors / 2 email / 1 database;
//      toggling a module persists across an app reload.
//
// Run: node scripts/probe-slice7.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, HEADLESS_SHELL, makeReporter, startPreview, waitForPhase, watchConsole } from './probe-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = makeReporter('slice 7 probe (mock)');
const stopPreview = await startPreview(4173, ROOT);

let browser;
let ok = false;
try {
  browser = await chromium.launch({ executablePath: HEADLESS_SHELL, headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = watchConsole(page, report);
  await page.goto('http://localhost:4173/?adapter=mock', { waitUntil: 'load' });
  await waitForPhase(page, 'ready');
  report.check('app ready via mock adapter', true);

  // ---- intents via chat ----
  await page.locator('.seg button', { hasText: 'Conversations' }).click();
  await page.waitForSelector('[data-testid="conv-row-conv-main"]');
  await page.locator('[data-testid="conv-row-conv-main"] button', { hasText: 'Open' }).first().click();
  await page.waitForSelector('[data-testid="chat-panel"]');
  await page.fill('[data-testid="composer"]', 'propose a session');
  await page.click('[data-testid="send-btn"]');

  // webview intent opens the viewer on its own
  await page.waitForSelector('.slideover[aria-label="Artifact: Chinese map + timeline outline"]', { timeout: 15_000 });
  const viewerText = (await page.textContent('.slideover[aria-label="Artifact: Chinese map + timeline outline"]')) ?? '';
  report.check(
    'webview intent opened the artifact viewer (Chinese map + timeline outline)',
    /Chinese map \+ timeline outline/.test(viewerText) && /Provenance/.test(viewerText),
  );
  await page.click('button[aria-label="Close viewer"]');
  await page.waitForTimeout(400);

  const chatText = (await page.textContent('[data-testid="chat-body"]')) ?? '';
  report.check(
    'chat shows the CLEAN reply — no intent fence, no JSON',
    chatText.includes('Here is a proposed session') && !chatText.includes('```intent') && !chatText.includes('"type":"schedule"'),
  );
  await page.click('button[aria-label="Close chat"]');

  // ---- proposed schedule: not auto-filed, Accept files, Reject discards ----
  await page.locator('.seg button', { hasText: 'Schedule' }).click();
  await page.waitForSelector('[data-testid="proposed-by-chat"]', { timeout: 10_000 });
  const schedText = (await page.textContent('main')) ?? '';
  report.check('Schedule shows "Proposed by chat" with the proposed entry', /Planning session \(from chat\)/.test(schedText));
  report.check(
    'proposal is NOT in the filed schedule yet (manual-first)',
    await page.evaluate(() => {
      const gantt = document.querySelector('[data-testid="gantt"]');
      return !(gantt?.textContent ?? '').includes('Planning session (from chat)');
    }),
  );
  const proposal = page.locator('[data-testid^="proposal-prop-"]').first();
  const proposalId = (await proposal.getAttribute('data-testid')).replace('proposal-', '');
  await page.click(`[data-testid="proposal-accept-${proposalId}"]`);
  await page.waitForFunction(
    () => (document.querySelector('[data-testid="gantt"]')?.textContent ?? '').includes('Planning session (from chat)'),
    { timeout: 10_000 },
  );
  report.check('Accept files the entry into the schedule (Gantt)', true);
  report.check('proposal section clears after Accept', (await page.locator('[data-testid="proposed-by-chat"]').count()) === 0);

  // second proposal → Reject
  await page.locator('.seg button', { hasText: 'Conversations' }).click();
  await page.waitForSelector('[data-testid="conv-row-conv-main"]');
  await page.locator('[data-testid="conv-row-conv-main"] button', { hasText: 'Open' }).first().click();
  await page.waitForSelector('[data-testid="chat-panel"]');
  await page.fill('[data-testid="composer"]', 'propose a session');
  await page.click('[data-testid="send-btn"]');
  await page.waitForTimeout(2500); // let the reply + intents land
  const closeViewer2 = page.locator('button[aria-label="Close viewer"]');
  if (await closeViewer2.count()) await closeViewer2.click().catch(() => {});
  await page.click('button[aria-label="Close chat"]');
  await page.locator('.seg button', { hasText: 'Schedule' }).click();
  await page.waitForSelector('[data-testid="proposed-by-chat"]', { timeout: 10_000 });
  const proposal2 = page.locator('[data-testid^="proposal-prop-"]').first();
  const proposalId2 = (await proposal2.getAttribute('data-testid')).replace('proposal-', '');
  await page.click(`[data-testid="proposal-reject-${proposalId2}"]`);
  await page.waitForTimeout(600);
  report.check('Reject discards the proposal', (await page.locator('[data-testid="proposed-by-chat"]').count()) === 0);
  const ganttCount = await page.evaluate(() =>
    (document.querySelector('[data-testid="gantt"]')?.textContent.match(/Planning session \(from chat\)/g) || []).length,
  );
  report.check('schedule still holds exactly the one accepted entry', ganttCount === 1, `gantt occurrences=${ganttCount}`);

  // ---- control panel: layout review burst ----
  await page.locator('.seg button', { hasText: 'Board' }).click();
  await page.waitForSelector('[data-testid="action-layout-review"]');
  await page.click('[data-testid="action-layout-review"]');
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-testid="toast"]')].some((t) => /acknowledged/i.test(t.textContent ?? '')),
    { timeout: 10_000 },
  );
  report.check('control action acked (toast)', true);
  await page.waitForSelector('[data-testid="recent-conv-nibglider"]', { timeout: 20_000 });
  const recentText = (await page.textContent('[data-testid="recent-conv-nibglider"]')) ?? '';
  report.check(
    'layout-review burst completed into Recently Finished with its outcome',
    /Layout review complete/.test(recentText),
    recentText.slice(0, 80).replace(/\n/g, ' '),
  );

  // ---- resources: counts + toggle persistence ----
  const resourcesText = (await page.textContent('main')) ?? '';
  report.check(
    'Resources panel lists Monitor Modules · 4, Email Accounts · 2, Databases · 1',
    /Monitor Modules · 4/.test(resourcesText) && /Email Accounts · 2/.test(resourcesText) && /Databases · 1/.test(resourcesText),
  );
  await page.click('[data-testid="resource-toggle-mon-prices"]');
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'load' });
  await waitForPhase(page, 'ready');
  const toggleText = (await page.textContent('[data-testid="resource-toggle-mon-prices"]')) ?? '';
  report.check('resource toggle persists across reload (records)', /Connected/.test(toggleText), toggleText.trim());

  const realErrors = errors.filter((e) => !/net::ERR|Failed to load resource/.test(e));
  report.check('no app console errors', realErrors.length === 0, realErrors.join(' | '));
  ok = report.summary();
} finally {
  if (browser) await browser.close().catch(() => {});
  stopPreview();
}
process.exit(ok ? 0 : 1);
