// Presence-protocol driven verification — tab close is DETECTED.
//
// The calibration finding (docs/CALIBRATION-REPORT.md, Phase 3 item 6):
// closing the muse.ai tab left the app at "ready" forever, because the
// background worker kept a stale tab registration and nothing ever
// revoked the passing checks. This probe reproduces that scenario
// against the fixture with the real MV3 extension loaded
// (launchPersistentContext + --load-extension, METHOD=extension only —
// no injection fallback: presence is an extension-level behaviour, so
// an injected run would prove nothing about it).
//
// Flow: boot → ready 11/11 → open Main chat → type a draft → CLOSE
// the fixture tab (page.close(); the persistent context and its
// service worker stay alive — the real scenario) → within 10s the app
// must leave ready, the tab check must fail with the tab-closed
// detail, and a send attempt must reject not-ready with the draft
// preserved → REOPEN the fixture in a new tab → the app returns to
// ready 11/11 on its own and a send lands end-to-end → the chat shows
// exactly ONE system line for the loss and ONE for the recovery.
//
// Run under xvfb:  xvfb-run -a node scripts/probe-presence.mjs

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
const DATA_DIR = '/tmp/md-bridge-data-presence';
const PROFILE_DIR = '/tmp/md-profile-presence';
const DRAFT = 'Presence probe draft — not sent yet';
const SEND_TEXT = 'Presence probe send after recovery';

const report = makeReporter('presence probe');
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

const countIn = async (page, needle) =>
  page.evaluate(
    (n) => (document.querySelector('[data-testid="chat-body"]')?.textContent ?? '').split(n).length - 1,
    needle,
  );

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

  let fixturePage = await context.newPage();
  await fixturePage.goto(`http://localhost:${FIXTURE_PORT}/fixture`, { waitUntil: 'load' });
  await fixturePage.waitForSelector('html[data-md-content="ready"]', { timeout: 10_000 });
  report.check('content script injected BY THE EXTENSION into the fixture page', true);

  const appPage = await context.newPage();
  const errors = watchConsole(appPage, report);
  await appPage.goto(`http://localhost:${APP_PORT}/?adapter=muse`, { waitUntil: 'load' });
  await waitForPhase(appPage, 'ready');
  report.check('app reaches ready with the tab open', true);
  await appPage.click('[data-testid="lamp-cluster"]');
  await appPage.waitForSelector('.popover');
  const pop0 = await appPage.textContent('.popover');
  report.check('checklist 11/11 before the close', /Checks: 11\/11/.test(pop0 ?? ''));
  await appPage.click('button[aria-label="Close connection panel"]');

  // open Main chat, type a draft (never sent while the tab is open)
  await appPage.locator('.seg button', { hasText: 'Conversations' }).click();
  await appPage.waitForSelector('[data-testid="conv-row-conv-main"]');
  await appPage.locator('[data-testid="conv-row-conv-main"] button', { hasText: 'Open' }).first().click();
  await appPage.waitForSelector('[data-testid="chat-panel"]');
  report.check('chat panel opens (Main chat)', true);
  report.check('no system lines yet', (await countIn(appPage, 'Connection error')) === 0 && (await countIn(appPage, 'Connection restored')) === 0);
  await appPage.fill('[data-testid="composer"]', DRAFT);

  // ---- close the TAB ----
  const closedAt = Date.now();
  await fixturePage.close();
  await waitForPhase(appPage, 'error', 10_000);
  const detectMs = Date.now() - closedAt;
  report.check('app leaves ready within 10s of the tab closing', true, `detected in ${detectMs}ms`);
  const lampAfter = await appPage.textContent('[data-testid="lamp-cluster"]');
  report.check('lamp no longer claims ready', !/· ready/.test(lampAfter ?? ''), (lampAfter ?? '').trim());

  await appPage.click('[data-testid="lamp-cluster"]');
  await appPage.waitForSelector('.popover');
  const pop1 = await appPage.textContent('.popover');
  report.check('tab check fails with the tab-closed detail in the popover', /Muse tab closed or not responding/.test(pop1 ?? ''), (pop1 ?? '').slice(0, 60).replace(/\n/g, ' '));
  report.check('only bridge + extension checks still pass (Checks: 2/11)', /Checks: 2\/11/.test(pop1 ?? ''));
  await appPage.click('button[aria-label="Close connection panel"]');

  // composer gating: the draft survived the loss, and sending is
  // structurally impossible while gated — since D1 the Send button
  // renders only when the phase allows sending, so in the not-ready
  // state there is no send control to attempt with at all (the older
  // click-and-toast rejection this step used to assert is unreachable
  // by construction now; absence + a preserved draft is the contract)
  const draftKept = await appPage.inputValue('[data-testid="composer"]');
  report.check('draft preserved verbatim across the tab loss', draftKept === DRAFT);
  const sendBtnCount = await appPage.locator('[data-testid="send-btn"]').count();
  report.check('no Send button exists while the tab is gone (D1 gated-send contract)', sendBtnCount === 0, `count=${sendBtnCount}`);
  const draftAfterSend = await appPage.inputValue('[data-testid="composer"]');
  report.check('draft still preserved in the gated state', draftAfterSend === DRAFT);

  await appPage.waitForTimeout(600); // let any flapping show itself
  report.check('exactly ONE system line for the loss', (await countIn(appPage, 'Connection error')) === 1,
    `error lines=${await countIn(appPage, 'Connection error')}`);

  // ---- reopen the fixture in a NEW tab ----
  fixturePage = await context.newPage();
  await fixturePage.goto(`http://localhost:${FIXTURE_PORT}/fixture`, { waitUntil: 'load' });
  await fixturePage.waitForSelector('html[data-md-content="ready"]', { timeout: 10_000 });
  await waitForPhase(appPage, 'ready', 15_000);
  report.check('app returns to ready on its own when the tab reopens', true);
  await appPage.click('[data-testid="lamp-cluster"]');
  await appPage.waitForSelector('.popover');
  const pop2 = await appPage.textContent('.popover');
  report.check('checklist back to 11/11 after recovery', /Checks: 11\/11/.test(pop2 ?? ''));
  await appPage.click('button[aria-label="Close connection panel"]');

  await appPage.waitForTimeout(600);
  report.check('exactly ONE system line for the recovery', (await countIn(appPage, 'Connection restored')) === 1,
    `restored lines=${await countIn(appPage, 'Connection restored')}`);
  report.check('still exactly ONE loss line (no flap spam)', (await countIn(appPage, 'Connection error')) === 1);

  // a real send now lands end-to-end in the reopened tab
  await appPage.fill('[data-testid="composer"]', SEND_TEXT);
  await appPage.click('[data-testid="send-btn"]');
  await fixturePage.waitForFunction(
    (t) => [...document.querySelectorAll('[data-testid="message-list"] .msg')].some(
      (el) => el.getAttribute('data-role') === 'user' && el.textContent.trim() === t,
    ),
    SEND_TEXT,
    { timeout: 10_000 },
  );
  report.check('send after recovery LANDS in the reopened fixture tab', true);
  await appPage.waitForFunction(
    (t) => document.querySelector('[data-testid="chat-body"]')?.textContent.includes(t),
    SEND_TEXT,
    { timeout: 10_000 },
  );
  report.check('observation echo shows the recovered send in the app chat', true);
  const draftFinal = await appPage.inputValue('[data-testid="composer"]');
  report.check('draft cleared on the accepted send', draftFinal === '');

  const realErrors = errors.filter((e) => !/net::ERR|Failed to load resource/.test(e));
  report.check('no app console errors', realErrors.length === 0, realErrors.join(' | '));
  ok = report.summary();
} finally {
  if (context) await context.close().catch(() => {});
  stopPreview();
  bridge.stop();
  fixture.stop();
}
console.log('\nMETHOD=extension');
process.exit(ok ? 0 : 1);
