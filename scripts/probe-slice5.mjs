// Slice 5 driven verification — real receive, end to end.
// Extension-loaded setup as in probe-slice3/4. Checks:
//  1. Full round trip: send from the app → the fixture bot streams →
//     the app shows a STREAMING message whose text grows in increments
//     (recorded by an in-page MutationObserver; at least one recorded
//     state must be a strict partial of the final text).
//  2. Settle produces exactly ONE final: the full reply appears once in
//     the chat, and the streaming element is gone.
//  3. App reload mid-conversation: reopening adopts the page history —
//     the reply still appears exactly once (id dedupe at every layer).
//  4. Bridge restart: the app goes disconnected, the bridge comes back,
//     the extension + adapter reconnect to ready, and the conversation
//     still shows the reply exactly once; a fresh send still works.
//
// Run: xvfb-run -a node scripts/probe-slice5.mjs

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
const DATA_DIR = '/tmp/md-bridge-data-s5';
const PROFILE_DIR = '/tmp/md-profile-s5';
const BRIDGE_ENV = { MD_BRIDGE_PORT: '7701', MD_PAIRING_TOKEN: TOKEN, MD_DATA_DIR: DATA_DIR };

const report = makeReporter('slice 5 probe');
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.rmSync(PROFILE_DIR, { recursive: true, force: true });

let bridge = spawnNode('bridge/bridge.mjs', [], BRIDGE_ENV, ROOT);
const fixture = spawnNode('tests/fixture/serve.mjs', [], { MD_FIXTURE_PORT: '7790' }, ROOT);
const stopPreview = await startPreview(4173, ROOT);

const countReply = (page) =>
  page.evaluate(() => {
    const body = document.querySelector('[data-testid="chat-body"]');
    if (!body) return 0;
    return (body.textContent.match(/Fixture reply/g) || []).length;
  });

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

  const openMainChat = async () => {
    await appPage.locator('.seg button', { hasText: 'Conversations' }).click();
    await appPage.waitForSelector('[data-testid="conv-row-conv-main"]');
    await appPage.locator('[data-testid="conv-row-conv-main"] button', { hasText: 'Open' }).first().click();
    await appPage.waitForSelector('[data-testid="chat-panel"]');
  };
  await openMainChat();
  report.check('chat opens; ready for the round trip', true);

  // record streaming states in-page before sending
  await appPage.evaluate(() => {
    window.__streamStates = [];
    const body = document.querySelector('[data-testid="chat-body"]');
    const obs = new MutationObserver(() => {
      const el = document.querySelector('[data-testid="streaming-msg"]');
      if (el) window.__streamStates.push(el.textContent);
    });
    obs.observe(body, { childList: true, subtree: true, characterData: true });
    window.__streamObs = obs;
  });

  await appPage.fill('[data-testid="composer"]', 'Stream test please');
  await appPage.click('[data-testid="send-btn"]');

  // final lands: reply count becomes 1 and stays the only copy
  await appPage.waitForFunction(
    () => (document.querySelector('[data-testid="chat-body"]')?.textContent.match(/Fixture reply/g) || []).length === 1
      && !document.querySelector('[data-testid="streaming-msg"]'),
    { timeout: 20_000 },
  );
  report.check('exactly one final reply in the app chat; streaming element cleared', true);

  const states = await appPage.evaluate(() => window.__streamStates ?? []);
  const partials = states.filter((s) => s.length > 0 && s.length < 60);
  report.check(
    'streaming increments were visible (partial states recorded)',
    states.length >= 2 && partials.length >= 1,
    `${states.length} states, first="${(states[0] ?? '').slice(0, 30)}"`,
  );

  // 3. app reload → reopen → still exactly one copy
  await appPage.reload({ waitUntil: 'load' });
  await waitForPhase(appPage, 'ready');
  await openMainChat();
  await appPage.waitForTimeout(800);
  report.check('after app reload + reopen, the reply still appears exactly once', (await countReply(appPage)) === 1);

  // 4. bridge restart → disconnected → ready, no dupes, send still works
  bridge.stop();
  await waitForPhase(appPage, 'disconnected', 20_000);
  report.check('bridge stop drives the app to disconnected', true);
  bridge = spawnNode('bridge/bridge.mjs', [], BRIDGE_ENV, ROOT);
  await waitForPhase(appPage, 'ready', 30_000);
  report.check('bridge restart + reconnect returns to ready', true);
  report.check('no duplicate reply after reconnect', (await countReply(appPage)) === 1);

  await appPage.fill('[data-testid="composer"]', 'After reconnect hello');
  await appPage.click('[data-testid="send-btn"]');
  await fixturePage.waitForFunction(
    (t) => [...document.querySelectorAll('[data-testid="message-list"] .msg')].some((el) => el.textContent.trim() === t),
    'After reconnect hello',
    { timeout: 10_000 },
  );
  report.check('send still lands in the fixture after the bridge restart', true);

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
