// Slice 6 driven verification — approvals + activity, fixture-verified.
// Extension-loaded setup as in probe-slice3/4/5. Checks:
//  APPROVALS
//   1. Fixture "Trigger approval" → the card is mirrored into the app's
//      Needs You with the §2.12 scope buttons (Allow once/Always allow).
//   2. "Always allow" in the APP → the content script clicks the REAL
//      Always control in the fixture → the card resolves in the page
//      (data-resolved + outcome text), the app row clears, and the
//      decision log shows "Allowed — always".
//   3. Deny path: a second card, denied from the app, resolves as deny
//      in the fixture and logs "Denied".
//  ACTIVITY (§2.10 refinement — the panel is the source of record)
//   4. The app's Running Now card for the routed conversation shows the
//      activity title; expanding it shows detail text that MATCHES the
//      fixture Activity panel entry of the same title.
//   5. When the fixture's review activity finishes (~35 s) and moves to
//      Past with an outcome, the app's Recently Finished shows it with
//      that outcome.
//   6. Transience: activity traffic writes nothing to records — the
//      bridge's md_events count is unchanged across the activity phase.
//
// Run: xvfb-run -a node scripts/probe-slice6.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chromium,
  FULL_CHROMIUM,
  makeReporter,
  startPreview,
  spawnNode,
  waitForPhase,
  watchConsole,
} from './probe-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = 'probe-pairing-token-0123456789abcdef';
const DATA_DIR = '/tmp/md-bridge-data-s6';
const PROFILE_DIR = '/tmp/md-profile-s6';

const report = makeReporter('slice 6 probe');
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.rmSync(PROFILE_DIR, { recursive: true, force: true });

const bridge = spawnNode('bridge/bridge.mjs', [], {
  MD_BRIDGE_PORT: '7701', MD_PAIRING_TOKEN: TOKEN, MD_DATA_DIR: DATA_DIR,
}, ROOT);
const fixture = spawnNode('tests/fixture/serve.mjs', [], { MD_FIXTURE_PORT: '7790' }, ROOT);
const stopPreview = await startPreview(4173, ROOT);

const eventsCount = async () =>
  (await (await fetch('http://127.0.0.1:7701/records/md_events')).json()).length;

let context;
let ok = false;
try {
  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: FULL_CHROMIUM,
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: [`--disable-extensions-except=${ROOT}/extension`, `--load-extension=${ROOT}/extension`, '--no-first-run'],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 12_000 });
  await worker.evaluate(async (t) => { await chrome.storage.local.set({ pairingToken: t }); }, TOKEN);

  const fixturePage = await context.newPage();
  await fixturePage.goto('http://localhost:7790/fixture', { waitUntil: 'load' });
  await fixturePage.waitForSelector('html[data-md-content="ready"]', { timeout: 10_000 });

  const appPage = await context.newPage();
  const errors = watchConsole(appPage, report);
  await appPage.goto('http://localhost:4173/?adapter=muse', { waitUntil: 'load' });
  await waitForPhase(appPage, 'ready');
  report.check('app ready via real adapter', true);

  // Route page events to conv-main: open its chat once, then close it.
  await appPage.locator('.seg button', { hasText: 'Conversations' }).click();
  await appPage.waitForSelector('[data-testid="conv-row-conv-main"]');
  await appPage.locator('[data-testid="conv-row-conv-main"] button', { hasText: 'Open' }).first().click();
  await appPage.waitForSelector('[data-testid="chat-panel"]');
  await appPage.click('button[aria-label="Close chat"]');
  await appPage.locator('.seg button', { hasText: 'Board' }).click();
  await appPage.waitForTimeout(1000);
  const eventsBaseline = await eventsCount();

  // ---- activity: detail match ----
  // Fixture side: open the panel and expand both active entries. The
  // fixture's detail text STEPS every ~6 s, so the comparison value is
  // read live at compare time (below), never from an early snapshot.
  await fixturePage.click('[data-testid="activity-button"]');
  await fixturePage.waitForSelector('[data-testid="activity-panel"]:not([hidden])');
  const fixtureTitles = await fixturePage.evaluate(() => {
    const titles = [];
    for (const entry of document.querySelectorAll('[data-testid="activity-active"] .activity-entry')) {
      entry.querySelector('.activity-head').click();
      titles.push(entry.querySelector('.a-title').textContent.trim());
    }
    return titles;
  });
  report.check('fixture Activity panel exposes active entries with detail', fixtureTitles.length >= 2, fixtureTitles.join(' | '));
  const readFixtureDetail = (title) =>
    fixturePage.evaluate((t) => {
      for (const entry of document.querySelectorAll('[data-testid="activity-active"] .activity-entry')) {
        if (entry.querySelector('.a-title').textContent.trim() === t) {
          return entry.querySelector('[data-testid="activity-detail"]').textContent.trim();
        }
      }
      return null;
    }, title);

  await appPage.waitForSelector('[data-testid="job-conv-main"]', { timeout: 15_000 });
  const appTitle = (await appPage.textContent('[data-testid="job-conv-main"]')) ?? '';
  const matchedTitle = fixtureTitles.find((t) => appTitle.includes(t));
  report.check('Running Now card shows a fixture activity title', !!matchedTitle, matchedTitle ?? appTitle.slice(0, 60));
  await appPage.click('[data-testid="job-expand-conv-main"]');
  await appPage.waitForSelector('[data-testid="job-detail-conv-main"]');
  // The app mirrors the panel with a small lag; poll until the app's
  // detail equals the fixture's CURRENT detail for the same title
  // (steps advance on both sides together).
  let detailMatch = false;
  let lastApp = '';
  let lastFixture = '';
  for (let i = 0; i < 24 && !detailMatch && matchedTitle; i++) {
    // The detail region's SECOND child is the detail text itself (the
    // first is the "WHAT IT IS DOING" header) — read it structurally
    // rather than stripping header text out of a concatenation.
    lastApp = await appPage.evaluate(() => {
      const el = document.querySelector('[data-testid="job-detail-conv-main"]');
      return (el?.children[1]?.textContent ?? '').trim();
    });
    lastFixture = (await readFixtureDetail(matchedTitle)) ?? '';
    detailMatch = lastApp === lastFixture && lastApp.length > 0;
    if (!detailMatch) await appPage.waitForTimeout(500);
  }
  report.check(
    'expanded app card detail MATCHES the fixture panel detail',
    detailMatch,
    `app="${lastApp.slice(0, 50)}" fixture="${lastFixture.slice(0, 50)}"`,
  );

  // ---- approvals: Always allow ----
  await fixturePage.click('[data-testid="trigger-approval"]');
  await fixturePage.waitForSelector('[data-testid="approval-card"]');
  await appPage.waitForSelector('[data-testid="approval-row"]', { timeout: 15_000 });
  const rowText = (await appPage.textContent('[data-testid="approval-row"]')) ?? '';
  report.check('approval mirrored into Needs You with its real title', /Allow Kavi to push branch/.test(rowText));
  report.check('scope buttons offered (Always allow)', !!(await appPage.$('[data-testid="approval-always"]')));
  await appPage.click('[data-testid="approval-always"]');
  await fixturePage.waitForFunction(
    () => document.querySelector('[data-testid="approval-card"]')?.getAttribute('data-resolved') === 'allow-always',
    { timeout: 10_000 },
  );
  report.check('the REAL Always control was clicked in the fixture (card resolved in-page)', true);
  const fixtureOutcome = await fixturePage.textContent('[data-testid="approval-outcome"]');
  report.check('fixture card shows the outcome "Allowed — always"', /Allowed — always/.test(fixtureOutcome ?? ''));
  await appPage.waitForFunction(
    () => !document.querySelector('[data-testid="approval-row"]'),
    { timeout: 10_000 },
  );
  const boardText1 = (await appPage.textContent('main')) ?? '';
  report.check('app decision log shows "Allowed — always"', /Allowed — always/.test(boardText1));

  // ---- approvals: Deny ----
  await fixturePage.click('[data-testid="trigger-approval"]');
  await appPage.waitForSelector('[data-testid="approval-row"]', { timeout: 15_000 });
  await appPage.click('[data-testid="approval-deny"]');
  await fixturePage.waitForFunction(
    () => [...document.querySelectorAll('[data-testid="approval-card"]')].some(
      (c) => c.getAttribute('data-resolved') === 'deny',
    ),
    { timeout: 10_000 },
  );
  report.check('Deny path: the real Deny control resolved the second card', true);
  await appPage.waitForFunction(
    () => /Denied:/.test(document.querySelector('main')?.textContent ?? ''),
    { timeout: 10_000 },
  );
  report.check('app decision log shows "Denied"', true);

  // ---- activity: finish -> Recently Finished + transience ----
  // Baseline for the transience assertion is taken HERE, after the
  // approval phase: approval DECISIONS are records by design (md_events);
  // the assertion is that ACTIVITY traffic adds none.
  const eventsBeforeActivity = await eventsCount();
  // NB: target the REVIEW entry specifically — the seeded past entry
  // (act-briefing) satisfies a generic "past + outcome" selector from
  // page load, which would not wait for anything.
  await fixturePage.waitForFunction(
    () => !!document.querySelector('[data-testid="activity-past"] .activity-entry[data-activity-id="act-review"]'),
    { timeout: 60_000 },
  );
  report.check('fixture review activity finished and moved to Past with an outcome', true);
  await appPage.waitForSelector('[data-testid="recent-conv-main"]', { timeout: 20_000 });
  const recentText = (await appPage.textContent('[data-testid="recent-conv-main"]')) ?? '';
  report.check(
    'Recently Finished shows the activity with its outcome',
    /Reviewing CSKG transcript batch/.test(recentText) && /26 grounded/.test(recentText),
    recentText.slice(0, 90).replace(/\n/g, ' '),
  );
  const eventsAfter = await eventsCount();
  report.check(
    'activity is transient: md_events count unchanged by activity traffic',
    eventsAfter === eventsBeforeActivity,
    `before=${eventsBeforeActivity} after=${eventsAfter} (earlier baseline ${eventsBaseline}; approval decisions are records by design)`,
  );

  const realErrors = errors.filter((e) => !/net::ERR|Failed to load resource/.test(e));
  report.check('no app console errors', realErrors.length === 0, realErrors.join(' | '));
  ok = report.summary();
} finally {
  if (context) await context.close().catch(() => {});
  stopPreview();
  bridge.stop();
  fixture.stop();
}
process.exit(ok ? 0 : 1);
