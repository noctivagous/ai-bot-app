// Slice 7 driven verification (MUSE half) — intents + control panel
// through the real adapter, extension-loaded as in probe-slice3..6.
// The fixture bot replies to "propose a session" with a message whose
// RAW text carries both intent fences; they stream through the page.
// Checks:
//  1. The app chat shows the CLEAN text only — no fence, no JSON — even
//     though the page streamed the raw blocks (adapter holdback +
//     final-time parsing).
//  2. The webview intent opens the artifact viewer with the referenced
//     artifact (art-chinese-map).
//  3. The schedule intent arrives as a Proposal (not auto-filed);
//     Accept files it — proven in the BRIDGE's records (Q3 transport).
//  4. Control Panel "Run layout review" → invokeAction rides the send
//     path: the fixture receives the structured command message
//     "[Mission Desk action] Run layout review (layout-review)" and the
//     app shows the ack.
//
// Run: xvfb-run -a node scripts/probe-slice7-muse.mjs

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
const DATA_DIR = '/tmp/md-bridge-data-s7';
const PROFILE_DIR = '/tmp/md-profile-s7';

const report = makeReporter('slice 7 probe (muse)');
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.rmSync(PROFILE_DIR, { recursive: true, force: true });

const bridge = spawnNode('bridge/bridge.mjs', [], {
  MD_BRIDGE_PORT: '7701', MD_PAIRING_TOKEN: TOKEN, MD_DATA_DIR: DATA_DIR,
}, ROOT);
const fixture = spawnNode('tests/fixture/serve.mjs', [], { MD_FIXTURE_PORT: '7790' }, ROOT);
const stopPreview = await startPreview(4173, ROOT);

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

  await appPage.locator('.seg button', { hasText: 'Conversations' }).click();
  await appPage.waitForSelector('[data-testid="conv-row-conv-main"]');
  await appPage.locator('[data-testid="conv-row-conv-main"] button', { hasText: 'Open' }).first().click();
  await appPage.waitForSelector('[data-testid="chat-panel"]');
  await appPage.fill('[data-testid="composer"]', 'propose a session');
  await appPage.click('[data-testid="send-btn"]');

  // 2 (viewer may open as soon as the final lands — check it first)
  await appPage.waitForSelector('.slideover[aria-label="Artifact: Chinese map + timeline outline"]', { timeout: 20_000 });
  report.check('webview intent opened the artifact viewer with the referenced artifact', true);
  await appPage.click('button[aria-label="Close viewer"]');

  // 1: clean chat text
  const chatText = (await appPage.textContent('[data-testid="chat-body"]')) ?? '';
  report.check(
    'app chat shows the CLEAN reply — no fence, no JSON, though the page streamed them raw',
    chatText.includes('Here is a proposed session') && !chatText.includes('```intent') && !chatText.includes('"type"'),
    chatText.slice(-120).replace(/\n/g, ' '),
  );
  // sanity: the fixture really did carry the raw fences in its message
  const fixtureRaw = await fixturePage.evaluate(() =>
    [...document.querySelectorAll('[data-testid="message-list"] .msg')].map((el) => el.textContent).join('\n'));
  report.check('fixture page message indeed contains the raw intent fences', fixtureRaw.includes('```intent'));
  await appPage.click('button[aria-label="Close chat"]');

  // 3: proposal → accept → bridge records proof
  await appPage.locator('.seg button', { hasText: 'Schedule' }).click();
  await appPage.waitForSelector('[data-testid="proposed-by-chat"]', { timeout: 10_000 });
  const propText = (await appPage.textContent('[data-testid="proposed-by-chat"]')) ?? '';
  report.check('schedule intent arrived as a proposal ("Fixture planning session")', /Fixture planning session/.test(propText));
  const proposal = appPage.locator('[data-testid^="proposal-prop-"]').first();
  const proposalId = (await proposal.getAttribute('data-testid')).replace('proposal-', '');
  await appPage.click(`[data-testid="proposal-accept-${proposalId}"]`);
  await appPage.waitForFunction(
    () => (document.querySelector('[data-testid="gantt"]')?.textContent ?? '').includes('Fixture planning session'),
    { timeout: 10_000 },
  );
  report.check('Accept files the entry into the Gantt', true);
  const remoteSchedule = await (await fetch('http://127.0.0.1:7701/records/md_schedule')).json();
  report.check(
    'the filed entry persisted into BRIDGE records (Q3)',
    remoteSchedule.some((s) => s.title === 'Fixture planning session'),
    `${remoteSchedule.length} entries on the bridge`,
  );

  // 4: control panel via the send path
  await appPage.locator('.seg button', { hasText: 'Board' }).click();
  await appPage.waitForSelector('[data-testid="action-layout-review"]');
  await appPage.click('[data-testid="action-layout-review"]');
  await fixturePage.waitForFunction(
    (t) => [...document.querySelectorAll('[data-testid="message-list"] .msg')].some((el) => el.textContent.includes(t)),
    '[Mission Desk action] Run layout review (layout-review)',
    { timeout: 15_000 },
  );
  report.check('invokeAction reached the fixture as a structured command message', true);
  await appPage.waitForFunction(
    () => [...document.querySelectorAll('[data-testid="toast"]')].some((t) => /Action sent to the chat/.test(t.textContent ?? '')),
    { timeout: 10_000 },
  );
  report.check('app shows the action ack', true);

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
