// Shared helpers for the driven (headless-browser) slice probes.
//
// playwright-core is not an app dependency; it is borrowed from the
// layout-tools install, and drives the cached headless Chromium — the
// same arrangement as the slice 0–1 probes. Probes run against the
// production build served by `vite preview`.
//
// Console-error policy: this sandbox's egress proxy blocks Google Fonts
// (ERR_TUNNEL_CONNECTION_FAILED for fonts.googleapis.com /
// fonts.gstatic.com). Those requests are environmental, not app errors,
// and are filtered; everything else counts.

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';

const require = createRequire('/home/hatch/workspace/layout-tools/package.json');
export const { chromium } = require('playwright-core');

export const HEADLESS_SHELL =
  '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
export const FULL_CHROMIUM =
  '/home/hatch/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';

export function makeReporter(sliceLabel) {
  const results = [];
  return {
    check(name, ok, extra = '') {
      results.push({ name, ok: !!ok, extra });
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
    },
    summary() {
      const failed = results.filter((r) => !r.ok);
      console.log(
        `\n${sliceLabel}: ${results.length - failed.length}/${results.length} checks passed` +
          (failed.length ? `; FAILURES: ${failed.map((f) => f.name).join(' | ')}` : ''),
      );
      return failed.length === 0;
    },
  };
}

export function watchConsole(page, reporter) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    const url = msg.location()?.url ?? '';
    if (/fonts\.(googleapis|gstatic)\.com/.test(text) || /fonts\.(googleapis|gstatic)\.com/.test(url)) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

export function waitForHttp(url, timeoutMs = 30_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error(`timeout waiting for ${url}`));
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

/** Start `vite preview` for the app build on a port; returns a stop fn. */
export async function startPreview(port, cwd) {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    cwd,
    stdio: 'pipe',
    env: { ...process.env },
  });
  await waitForHttp(`http://localhost:${port}/`);
  return () => proc.kill('SIGTERM');
}

/** Spawn a node script (bridge, fixture server); returns {proc, stop}. */
export function spawnNode(script, args = [], env = {}, cwd = undefined) {
  const proc = spawn('node', [script, ...args], {
    cwd,
    stdio: 'pipe',
    env: { ...process.env, ...env },
  });
  proc.stderr.on('data', (d) => process.stderr.write(`[node ${script}] ${d}`));
  return { proc, stop: () => proc.kill('SIGTERM') };
}

export async function launchAppPage(browser, url, viewport = { width: 1600, height: 1000 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

/** Wait for the adapter lamp cluster to report the given phase word. */
export async function waitForPhase(page, phase, timeoutMs = 30_000) {
  await page.waitForFunction(
    (p) => {
      const el = document.querySelector('[data-testid="lamp-cluster"]');
      return el && el.textContent && el.textContent.toLowerCase().includes(p);
    },
    phase,
    { timeout: timeoutMs },
  );
}
