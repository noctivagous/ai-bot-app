// Slice 3 driven verification — bridge + extension health, end to end.
// 1. Starts the bridge (test token + isolated data dir), the fixture
//    server, and `vite preview` over the production build.
// 2. Tries to load the REAL MV3 extension into headful Chromium (under
//    xvfb): persistent context + --load-extension, seeds the pairing
//    token into chrome.storage.local via the service worker, opens the
//    fixture, and asserts the app (?adapter=muse) reaches `ready` with
//    the real 11-check checklist.
// 3. If extension loading fails in this environment, falls back to CDP
//    script injection of the same content script into the fixture and
//    labels the method INJECTED — the report never claims extension
//    loading that did not happen.
// 4. Signed-out fixture → auth check fails → error phase + sign-in hint.
// 5. Records ride the bridge (Q3): filing a conversation in the app
//    lands in the bridge's records, not just the browser.
//
// Run under xvfb:  xvfb-run -a node scripts/probe-slice3.mjs

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
const DATA_DIR = '/tmp/md-bridge-data-s3';
const PROFILE_DIR = '/tmp/md-profile-s3';

const report = makeReporter('slice 3 probe');
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
fs.rmSync(PROFILE_DIR + '-inj', { recursive: true, force: true });

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
async function waitExtensionPresent(ms = 12_000) {
  for (let i = 0; i < ms / 250; i++) {
    const h = await bridgeHealth();
    if (h?.extensionPresent) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
let bridgeUpSeen = false;
for (let i = 0; i < 30 && !bridgeUpSeen; i++) {
  bridgeUpSeen = !!(await bridgeHealth());
  if (!bridgeUpSeen) await new Promise((r) => setTimeout(r, 200));
}
report.check('bridge up on 127.0.0.1:7701', bridgeUpSeen);

let method = 'none';
let context = null;
let fixturePage = null;

async function tryExtension() {
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
  if (!worker) throw new Error('no service worker');
  report.check('MV3 service worker registered', true, worker.url());
  await worker.evaluate(async (token) => {
    await chrome.storage.local.set({ pairingToken: token });
  }, TOKEN);
  if (!(await waitExtensionPresent())) throw new Error('extension never connected to the bridge');
  report.check('extension connected to bridge (pairing token accepted)', true);

  fixturePage = await context.newPage();
  await fixturePage.goto(`http://localhost:${FIXTURE_PORT}/fixture`, { waitUntil: 'load' });
  // Content scripts live in an isolated world: readiness is the DOM
  // stamp the script sets (the shared DOM), not a window flag.
  await fixturePage.waitForSelector('html[data-md-content="ready"]', { timeout: 10_000 });
  report.check('content script injected BY THE EXTENSION into the fixture page', true);
  method = 'extension';
}

async function tryInjection() {
  context = await chromium.launchPersistentContext(PROFILE_DIR + '-inj', {
    executablePath: FULL_CHROMIUM,
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  fixturePage = await context.newPage();
  await fixturePage.goto(`http://localhost:${FIXTURE_PORT}/fixture`, { waitUntil: 'load' });
  await fixturePage.evaluate((cfg) => {
    window.__MD_TEST_HOOKS__ = cfg;
  }, { wsUrl: `ws://127.0.0.1:${BRIDGE_PORT}`, token: TOKEN });
  await fixturePage.addScriptTag({ path: `${ROOT}/extension/selectors.js` });
  await fixturePage.addScriptTag({ path: `${ROOT}/extension/content.js` });
  await fixturePage.waitForFunction(() => window.__MD_CONTENT_READY__ === true, { timeout: 10_000 });
  if (!(await waitExtensionPresent())) throw new Error('injected script never connected');
  report.check('content script injected via CDP (test hooks, direct WS)', true);
  method = 'injected';
}

let ok = false;
try {
  try {
    await tryExtension();
  } catch (err) {
    report.check('MV3 extension loading in this Chromium', false, String(err?.message ?? err));
    if (context) await context.close().catch(() => {});
    context = null;
    fixturePage = null;
    await tryInjection();
  }
  console.log(`\nMETHOD=${method} (extension-loaded vs CDP-injected content script)`);

  const appPage = await context.newPage();
  const errors = watchConsole(appPage, report);
  await appPage.goto(`http://localhost:${APP_PORT}/?adapter=muse`, { waitUntil: 'load' });
  await waitForPhase(appPage, 'ready');
  const lampText = await appPage.textContent('[data-testid="lamp-cluster"]');
  report.check('app reaches ready via the real adapter + fixture', true, (lampText ?? '').trim());
  report.check('lamp label is adapter-driven ("Muse AI adapter")', /Muse AI adapter · ready/.test(lampText ?? ''));

  await appPage.click('[data-testid="lamp-cluster"]');
  await appPage.waitForSelector('.popover');
  const popText = await appPage.textContent('.popover');
  report.check('checklist is the real one (11 checks, all passing)', /Checks: 11\/11/.test(popText ?? ''), (popText ?? '').slice(0, 40).replace(/\n/g, ' '));
  report.check('checklist includes the Activity panel observer', /Activity panel observer/.test(popText ?? ''));
  report.check('identity surfaced from the page (Kavi)', /Kavi/.test(popText ?? ''));
  await appPage.keyboard.press('Escape');

  // records ride the bridge: file the unfiled conversation from the
  // Inbox section of the Conversations view (select + "File it")
  await appPage.locator('.seg button', { hasText: 'Conversations' }).click();
  await appPage.waitForSelector('[data-testid="inbox-row"]');
  await appPage.locator('[data-testid="inbox-row"] select').selectOption({ index: 1 });
  await appPage.click('[data-testid="inbox-file"]');
  await appPage.waitForTimeout(1000);
  const remote = await (await fetch(`http://127.0.0.1:${BRIDGE_PORT}/records/md_conversations`)).json();
  const filed = remote.find((c) => c.id === 'conv-lattice');
  report.check('filing persisted into BRIDGE records (Q3)', !!filed && !!filed.projectId, filed?.projectId ?? 'missing');

  // signed-out fixture → auth fail → error + hint
  await fixturePage.goto(`http://localhost:${FIXTURE_PORT}/fixture?signedout`, { waitUntil: 'load' });
  await appPage.waitForTimeout(1500);
  await waitForPhase(appPage, 'error', 25_000);
  report.check('signed-out fixture drives the app to error phase', true);
  await appPage.click('[data-testid="lamp-cluster"]');
  await appPage.waitForSelector('.popover');
  const errPop = await appPage.textContent('.popover');
  report.check('auth check fails and the popover shows the sign-in hint', /sign in/i.test(errPop ?? ''), (errPop ?? '').slice(0, 80).replace(/\n/g, ' '));

  const realErrors = errors.filter((e) => !/net::ERR|Failed to load resource/.test(e));
  report.check('no app console errors', realErrors.length === 0, realErrors.join(' | '));
  ok = report.summary();
} finally {
  if (context) await context.close().catch(() => {});
  stopPreview();
  bridge.stop();
  fixture.stop();
}
console.log(`\nMETHOD=${method}`);
process.exit(ok ? 0 : 1);
