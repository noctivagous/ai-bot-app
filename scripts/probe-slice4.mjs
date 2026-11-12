// Slice 4 driven verification — real send, fixture-verified.
// Extension-loaded setup as in probe-slice3 (headful Chromium under
// xvfb). Checks:
//  1. Fixture honesty: writing the composer by direct .value assignment
//     does NOT register with the framework-controlled state — clicking
//     Send sends nothing. (This is what makes the native-setter path in
//     the content script a real test rather than theatre.)
//  2. Happy path: send from the APP UI → the content script drives the
//     fixture's own composer + send control → the user message LANDS in
//     the fixture's message list; the observation echo shows it in the
//     app chat; the app draft clears on acceptance.
//  3. Negative: fixture ?nosend (no send control) → the app send rejects
//     typed ('gone', message names the missing control), a toast
//     surfaces it, the DRAFT IS PRESERVED, and nothing lands in the
//     fixture.
//
// Run: xvfb-run -a node scripts/probe-slice4.mjs

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
const DATA_DIR = '/tmp/md-bridge-data-s4';
const PROFILE_DIR = '/tmp/md-profile-s4';
const TEXT = 'Slice 4 verification message';

const report = makeReporter('slice 4 probe');
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
  report.check('content script loaded by the extension', true);

  // 1. fixture honesty: direct .value assignment must NOT register
  const sneakyLanded = await fixturePage.evaluate((text) => {
    const ta = document.querySelector('[data-testid="composer"]');
    ta.value = text; // tracked setter: the framework sees no edit
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-testid="send-button"]').click();
    return [...document.querySelectorAll('[data-testid="message-list"] .msg')].some(
      (el) => el.textContent.includes(text),
    );
  }, 'sneaky direct assignment');
  report.check('fixture composer honestly ignores direct .value writes', sneakyLanded === false);

  const appPage = await context.newPage();
  const errors = watchConsole(appPage, report);
  await appPage.goto('http://localhost:4173/?adapter=muse', { waitUntil: 'load' });
  await waitForPhase(appPage, 'ready');
  report.check('app ready via real adapter', true);

  // open Main chat from the Conversations table
  await appPage.locator('.seg button', { hasText: 'Conversations' }).click();
  await appPage.waitForSelector('[data-testid="conv-row-conv-main"]');
  await appPage.locator('[data-testid="conv-row-conv-main"] button', { hasText: 'Open' }).first().click();
  await appPage.waitForSelector('[data-testid="chat-panel"]');
  report.check('chat panel opens (Main chat)', true);

  // 2. happy path send
  await appPage.fill('[data-testid="composer"]', TEXT);
  await appPage.click('[data-testid="send-btn"]');
  await fixturePage.waitForFunction(
    (t) => [...document.querySelectorAll('[data-testid="message-list"] .msg')].some(
      (el) => el.getAttribute('data-role') === 'user' && el.textContent.trim() === t,
    ),
    TEXT,
    { timeout: 10_000 },
  );
  report.check('user message LANDED in the fixture message list', true);
  await appPage.waitForFunction(
    (t) => document.querySelector('[data-testid="chat-body"]')?.textContent.includes(t),
    TEXT,
    { timeout: 10_000 },
  );
  report.check('observation echo (message.user) shows the message in the app chat', true);
  const draftAfter = await appPage.inputValue('[data-testid="composer"]');
  report.check('app draft cleared on acceptance', draftAfter === '');

  // 3. negative: ?nosend fixture
  await fixturePage.goto('http://localhost:7790/fixture?nosend', { waitUntil: 'load' });
  await fixturePage.waitForSelector('html[data-md-content="ready"]', { timeout: 10_000 });
  await appPage.waitForTimeout(1200); // let the fresh page's probes land
  const TEXT2 = 'This must not send';
  await appPage.fill('[data-testid="composer"]', TEXT2);
  await appPage.click('[data-testid="send-btn"]');
  await appPage.waitForSelector('[data-testid="toast"]', { timeout: 15_000 });
  const toastText = await appPage.textContent('[data-testid="toast"]');
  report.check('send failure surfaces as a toast naming the cause', /Send rejected/.test(toastText ?? '') && /Send control not found/.test(toastText ?? ''), (toastText ?? '').trim());
  const draftKept = await appPage.inputValue('[data-testid="composer"]');
  report.check('draft preserved after the failed send', draftKept === TEXT2);
  const landed2 = await fixturePage.evaluate((t) =>
    [...document.querySelectorAll('[data-testid="message-list"] .msg')].some((el) => el.textContent.includes(t)), TEXT2);
  report.check('nothing landed in the fixture for the failed send', landed2 === false);

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
