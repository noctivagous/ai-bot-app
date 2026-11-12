// Bridge tests (node --test): protocol round trip + records endpoints.
// Uses the ws package as a client, exactly as the extension/app do.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const PORT = 17711;
const TOKEN = 'test-pairing-token-0123456789abcdef';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'md-bridge-test-'));
let proc;

function startBridge() {
  proc = spawn('node', ['bridge.mjs'], {
    cwd: path.dirname(new URL(import.meta.url).pathname),
    env: {
      ...process.env,
      MD_BRIDGE_PORT: String(PORT),
      MD_PAIRING_TOKEN: TOKEN,
      MD_DATA_DIR: tmp,
    },
    stdio: 'pipe',
  });
}

async function waitHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('bridge did not come up');
}

function connect(role, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    ws.messages = [];
    ws.waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      ws.messages.push(msg);
      ws.waiters = ws.waiters.filter((w) => !w(msg));
    });
    ws.waitFor = (pred, ms = 3000) =>
      new Promise((res, rej) => {
        const existing = ws.messages.find(pred);
        if (existing) return res(existing);
        const timer = setTimeout(() => rej(new Error('waitFor timeout')), ms);
        ws.waiters.push((msg) => {
          if (pred(msg)) {
            clearTimeout(timer);
            res(msg);
            return true;
          }
          return false;
        });
      });
    ws.on('open', () => {
      ws.send(JSON.stringify({ kind: 'hello', role, ...(token ? { token } : {}) }));
      resolve(ws);
    });
    ws.on('error', reject);
  });
}

before(async () => {
  startBridge();
  await waitHealth();
});

after(() => {
  proc?.kill('SIGTERM');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('extension hello with the wrong token is rejected (4401)', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  const closed = new Promise((res) => ws.on('close', (code) => res(code)));
  ws.on('open', () => ws.send(JSON.stringify({ kind: 'hello', role: 'extension', token: 'wrong' })));
  assert.equal(await closed, 4401);
});

test('presence, status relay, and command/result round trip', async () => {
  const app = await connect('app');
  const ack = await app.waitFor((m) => m.kind === 'hello-ack');
  assert.equal(ack.extensionPresent, false);

  const ext = await connect('extension', TOKEN);
  const presence = await app.waitFor((m) => m.kind === 'extension' && m.present === true);
  assert.ok(presence);

  ext.send(JSON.stringify({ kind: 'status', report: { checks: [{ id: 'auth', state: 'pass' }] } }));
  const status = await app.waitFor((m) => m.kind === 'status');
  assert.equal(status.report.checks[0].id, 'auth');

  ext.send(JSON.stringify({ kind: 'event', event: { kind: 'message.system', text: 'hi' } }));
  const evt = await app.waitFor((m) => m.kind === 'event');
  assert.equal(evt.event.kind, 'message.system');

  const resultPromise = app.waitFor((m) => m.kind === 'result' && m.id === 'c1');
  app.send(JSON.stringify({ kind: 'command', id: 'c1', name: 'openConversation', args: {} }));
  const cmd = await ext.waitFor((m) => m.kind === 'command' && m.id === 'c1');
  assert.equal(cmd.name, 'openConversation');
  ext.send(JSON.stringify({ kind: 'result', id: 'c1', ok: true, data: { messages: [] } }));
  const result = await resultPromise;
  assert.equal(result.ok, true);

  app.send(JSON.stringify({ kind: 'ping' }));
  const pong = await app.waitFor((m) => m.kind === 'pong');
  assert.ok(pong);

  ext.close();
  const gone = await app.waitFor((m) => m.kind === 'extension' && m.present === false);
  assert.ok(gone);

  // with no extension, a command gets an immediate typed 'gone' result
  app.send(JSON.stringify({ kind: 'command', id: 'c2', name: 'sendMessage', args: { text: 'x' } }));
  const noExt = await app.waitFor((m) => m.kind === 'result' && m.id === 'c2');
  assert.equal(noExt.ok, false);
  assert.equal(noExt.error.code, 'gone');
  app.close();
});

test('records: PUT/GET round trip, POST append, persistence across restart', async () => {
  const put = await fetch(`http://127.0.0.1:${PORT}/records/md_projects`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([{ id: 'p1', name: 'One' }]),
  });
  assert.equal(put.status, 200);
  const got = await (await fetch(`http://127.0.0.1:${PORT}/records/md_projects`)).json();
  assert.deepEqual(got, [{ id: 'p1', name: 'One' }]);

  const post = await fetch(`http://127.0.0.1:${PORT}/records/md_projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'p2', name: 'Two' }),
  });
  assert.equal(post.status, 201);
  const got2 = await (await fetch(`http://127.0.0.1:${PORT}/records/md_projects`)).json();
  assert.equal(got2.length, 2);

  // unknown collection reads as empty, and the data file is on disk
  const empty = await (await fetch(`http://127.0.0.1:${PORT}/records/nope`)).json();
  assert.deepEqual(empty, []);
  const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'records.json'), 'utf8'));
  assert.equal(onDisk.md_projects.length, 2);

  proc.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 300));
  startBridge();
  await waitHealth();
  const got3 = await (await fetch(`http://127.0.0.1:${PORT}/records/md_projects`)).json();
  assert.equal(got3.length, 2);
});
