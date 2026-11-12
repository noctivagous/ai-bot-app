// D4 follow-up driven verification — interrupted stamping, real adapter.
//
// The desk marks a stopped reply's partial with an "Interrupted" chip
// (FEATURE-MAP D4). For the real adapter the stamp is correlated
// IN-PAGE by the content script (streaming window ∩ Activity-entry
// window, exactly one candidate) and delivered as a message.bot.amend
// event. This probe drives the real MV3 extension against the fixture
// (launchPersistentContext + --load-extension, METHOD=extension only)
// through the fixture's two orderings plus a normal reply and the
// no-overlap control:
//
//   LATE  — Stop clicked; the reply settles (final delivered) and the
//           entry concludes "Interrupted" 1.4s later → the amend must
//           PATCH the delivered final.
//   EARLY — Stop clicked; the entry concludes "Interrupted" at once,
//           before the settle final → the amend must be BUFFERED and
//           stamped as the final lands.
//   NORMAL— an ordinary reply must carry no marker.
//   CONTROL — an "Interrupted" entry with no reply streaming near it
//           (fixture's Stale interrupt button) must stamp NOTHING.
//
// Run under xvfb:  xvfb-run -a node scripts/probe-interrupted.mjs

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
const APP_PORT = 4173;
const BRIDGE_PORT = 7701;
const FIXTURE_PORT = 7790;
const TOKEN = 'probe-pairing-token-0123456789abcdef';
const DATA_DIR = '/tmp/md-bridge-data-interrupt';
const PROFILE_DIR = '/tmp/md-profile-interrupt';

const report = makeReporter('interrupted probe (D4)');
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.rmSync(PROFILE_DIR, { recursive: true, force: true });

const bridge = spawnNode('bridge/bridge.mjs', [], {
  MD_BRIDGE_PORT: String(BRIDGE_PORT),
  MD_PAIRING_TOKEN: TOKEN,
  MD_DATA_DIR: DATA_DIR,
}, ROOT);
const fixture = spawnNode('tests/fixture/serve.mjs', [], { MD_FIXTURE_PORT: String(FIXTURE_PORT) }, ROOT);
const stopPreview = await startPreview(APP_PORT, ROOT);

async function bridgeHealth() {
  try {
    const r = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/health`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
let bridgeUpSeen = false;
for (let i = 0; i < 30 && !bridgeUpSeen; i++) {
  bridgeUpSeen = !!(await bridgeHealth());
  if (!bridgeUpSeen) await new Promise((r) => setTimeout(r, 200));
}
report.check('bridge up on 127.0.0.1:7701', bridgeUpSeen);

const markerCount = (page) =>
  page.evaluate(() => document.querySelectorAll('[data-testid="interrupted-marker"]').length);
const chatText = (page) =>
  page.evaluate(() => document.querySelector('[data-testid="chat-body"]')?.textContent ?? '');

async function sendAndStop(appPage, fixturePage, text, stopAfterMs) {
  await appPage.fill('[data-testid="composer"]', text);
  await appPage.click('[data-testid="send-btn"]');
  await fixturePage.waitForSelector('[data-testid="stop-button"]', { timeout: 10_000 });
  await fixturePage.waitForTimeout(stopAfterMs);
  await fixturePage.click('[data-testid="stop-button"]');
}

let context = null;
let ok = false;
try {
  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: FULL_CHROMIUM,
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: [
      `--disable-extensions-except=${ROOT}/extension`,
      `--load-extension=${ROOT}/extension`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 12_000 });
  report.check('MV3 service worker registered', !!worker, worker?.url() ?? '');
  await worker.evaluate(async (token) => {
    await chrome.storage.local.set({ pairingToken: token });
  }, TOKEN);
  console.log('\nMETHOD=extension');

  const fixturePage = await context.newPage();
  await fixturePage.goto(`http://localhost:${FIXTURE_PORT}/fixture`, { waitUntil: 'load' });
  await fixturePage.waitForSelector('html[data-md-content="ready"]', { timeout: 10_000 });
  report.check('content script injected BY THE EXTENSION into the fixture page', true);

  const appPage = await context.newPage();
  const errors = watchConsole(appPage, report);
  await appPage.goto(`http://localhost:${APP_PORT}/?adapter=muse`, { waitUntil: 'load' });
  await waitForPhase(appPage, 'ready');
  report.check('app reaches ready', true);

  await appPage.locator('.seg button', { hasText: 'Conversations' }).click();
  await appPage.waitForSelector('[data-testid="conv-row-conv-main"]');
  await appPage.locator('[data-testid="conv-row-conv-main"] button', { hasText: 'Open' }).first().click();
  await appPage.waitForSelector('[data-testid="chat-panel"]');
  report.check('chat panel opens (Main chat)', true);
  report.check('no interrupted markers before any stop', (await markerCount(appPage)) === 0);

  // ---- LATE: amend patches an already-delivered final ----
  await sendAndStop(appPage, fixturePage, 'please stop this reply late', 1200);
  await appPage.waitForFunction(
    () => document.querySelectorAll('[data-testid="interrupted-marker"]').length === 1,
    undefined,
    { timeout: 20_000 },
  );
  report.check('LATE: the stopped reply’s final carries the Interrupted marker', true);
  const lateText = await chatText(appPage);
  report.check('LATE: the partial text stands in the chat', lateText.includes('This reply was meant to run long'));
  report.check('LATE: the reply’s tail never arrived (it really was partial)', !lateText.includes('last briefing note'));

  // ---- EARLY: amend beats the final and is buffered ----
  await sendAndStop(appPage, fixturePage, 'please stop this reply early', 900);
  await appPage.waitForFunction(
    () => document.querySelectorAll('[data-testid="interrupted-marker"]').length === 2,
    undefined,
    { timeout: 20_000 },
  );
  report.check('EARLY: the early amend is buffered and stamps the final as it lands', true);

  // ---- NORMAL: an ordinary reply carries no marker ----
  await appPage.fill('[data-testid="composer"]', 'status please');
  await appPage.click('[data-testid="send-btn"]');
  await appPage.waitForFunction(
    (t) => document.querySelector('[data-testid="chat-body"]')?.textContent.includes(t),
    'Fixture reply — I received',
    { timeout: 15_000 },
  );
  await appPage.waitForTimeout(2500); // stream + settle + any stray amend all land within this beat
  report.check('NORMAL: ordinary reply lands', true);
  report.check('NORMAL: ordinary reply carries no marker', (await markerCount(appPage)) === 2);

  // ---- CONTROL: "Interrupted" with no overlapping stream stamps nothing ----
  await fixturePage.click('[data-testid="trigger-stale-interrupt"]');
  await fixturePage.waitForFunction(
    () => {
      const stale = [...document.querySelectorAll('[data-testid="activity-entry"]')].find((e) =>
        e.querySelector('.a-title')?.textContent.includes('Background tidy-up'),
      );
      const out = stale?.querySelector('[data-testid="activity-outcome"]');
      return !!out && !out.hidden && out.textContent.trim() === 'Interrupted';
    },
    undefined,
    { timeout: 10_000 },
  );
  report.check('CONTROL: the fixture entry really concluded "Interrupted"', true);
  await appPage.waitForTimeout(2500); // correlation + any erroneous stamp would arrive
  report.check('CONTROL: no message is stamped by a non-overlapping Interrupted', (await markerCount(appPage)) === 2);

  const realErrors = errors.filter((e) => !/net::ERR|Failed to load resource/.test(e));
  report.check('no app console errors', realErrors.length === 0, realErrors.join(' | '));
  ok = report.summary();
} finally {
  if (context) await context.close().catch(() => {});
  stopPreview();
  fixture.stop();
  bridge.stop();
}
console.log('\nMETHOD=extension');
process.exit(ok ? 0 : 1);
