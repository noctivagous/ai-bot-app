// Mission Desk bridge — DESIGN.md §9 + Q3 (decided: the bridge hosts
// records, so "run one local thing" stays true).
//
// What it is: a small Node process binding 127.0.0.1 ONLY. It holds one
// WebSocket from the app and one from the Muse extension's background
// worker and relays {status | event | command | result} frames between
// them without interpreting their content — the single exception is
// records, which is app data (organisation), not bot traffic, and lives
// here as plain collections.
//
// Pairing (§9): the app <-> extension pairing token is generated locally
// on first run into .pairing.json (mode 0600, gitignored). The EXTENSION
// must present it in its hello — it is the credential that proves the
// extension the user installed is the one talking. The APP connects
// without the token but is Origin-checked instead: a browser WebSocket
// always carries an Origin header, and only local app origins
// (http://localhost:* / http://127.0.0.1:*) are accepted. The asymmetry
// is deliberate: the app is the user's own page on their own machine
// (origin is its identity), while the extension is a separate principal
// that could be imitated by any local socket — so the extension proves
// itself with the token. Non-browser local clients (tests) send no
// Origin and are already inside the machine's trust boundary; the
// binding is localhost-only either way. The token is never sent to the
// muse.ai page, never stored in the page or localStorage, and never
// logged here (only the file path is printed).
//
// Env overrides (tests/dev): MD_BRIDGE_PORT, MD_PAIRING_TOKEN,
// MD_DATA_DIR, MD_PAIRING_FILE, MD_PRESENCE_TIMEOUT_MS,
// MD_PRESENCE_SWEEP_MS.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MD_BRIDGE_PORT ?? 7701);
const HOST = '127.0.0.1';
const DATA_DIR = process.env.MD_DATA_DIR ?? path.join(HERE, 'data');
const DATA_FILE = path.join(DATA_DIR, 'records.json');
const PAIRING_FILE = process.env.MD_PAIRING_FILE ?? path.join(HERE, '.pairing.json');

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
// Extension pages carry a chrome-extension:// Origin on their WebSocket.
// Admitting that scheme here does not weaken pairing: an extension
// connection is only accepted WITH the pairing token in its hello
// (below), and the token is the credential — the Origin check exists to
// keep arbitrary web pages out, and web pages can never present a
// chrome-extension:// Origin. Extension ids are 32 lowercase letters.
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
const WS_ORIGIN_OK = (origin) => LOCAL_ORIGIN.test(origin) || EXTENSION_ORIGIN.test(origin);

// ---- pairing token ----

function loadPairingToken() {
  if (process.env.MD_PAIRING_TOKEN) return process.env.MD_PAIRING_TOKEN;
  try {
    const parsed = JSON.parse(fs.readFileSync(PAIRING_FILE, 'utf8'));
    if (parsed && typeof parsed.token === 'string' && parsed.token.length >= 16) return parsed.token;
  } catch {
    // missing/corrupt — regenerate below
  }
  const token = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(PAIRING_FILE, JSON.stringify({ token }, null, 2) + '\n', { mode: 0o600 });
  try {
    fs.chmodSync(PAIRING_FILE, 0o600);
  } catch {
    // best effort on filesystems without modes
  }
  console.log(`[bridge] pairing token generated -> ${PAIRING_FILE} (paste it into the extension popup)`);
  return token;
}

const PAIRING_TOKEN = loadPairingToken();

// ---- records store (Q3) ----

function loadRecords() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // first run
  }
  return {};
}

let records = loadRecords();

function persistRecords() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(records, null, 2) + '\n');
  fs.renameSync(tmp, DATA_FILE);
}

// ---- HTTP: records + health (+ CORS for the local app origin) ----

function corsHeaders(req) {
  const origin = req.headers.origin;
  const headers = { vary: 'Origin' };
  if (origin && LOCAL_ORIGIN.test(origin)) headers['access-control-allow-origin'] = origin;
  return headers;
}

function sendJson(res, status, body, req) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...corsHeaders(req),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...corsHeaders(req),
        'access-control-allow-methods': 'GET, PUT, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '600',
      });
      res.end();
      return;
    }
    if (url.pathname === '/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, extensionPresent: !!extensionConn, apps: appConns.size }, req);
      return;
    }
    const m = url.pathname.match(/^\/records\/([A-Za-z0-9_-]+)$/);
    if (m) {
      const collection = m[1];
      if (req.method === 'GET') {
        sendJson(res, 200, records[collection] ?? [], req);
        return;
      }
      if (req.method === 'PUT') {
        const body = JSON.parse((await readBody(req)) || '[]');
        if (!Array.isArray(body)) return sendJson(res, 400, { error: 'expected a JSON array' }, req);
        records[collection] = body;
        persistRecords();
        return sendJson(res, 200, { ok: true, count: body.length }, req);
      }
      if (req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || 'null');
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return sendJson(res, 400, { error: 'expected a single record object' }, req);
        }
        (records[collection] ??= []).push(body);
        persistRecords();
        return sendJson(res, 201, body, req);
      }
    }
    sendJson(res, 404, { error: 'not found' }, req);
  } catch (err) {
    sendJson(res, 500, { error: String(err?.message ?? err) }, req);
  }
});

// ---- WebSocket relay ----

const appConns = new Set();
let extensionConn = null;
let lastStatusReport = null;
const pendingCommands = new Map(); // command id -> app socket

// ---- tab presence (presence protocol) ----
//
// The bridge is the one place that can tell a live Muse tab from a
// closed one: the content script beats every ~2s ({kind:'presence',
// state:'alive'}), the background worker reports an explicit
// {state:'gone'} when the tab closes or navigates away, and every
// other frame from the extension (status / event / result) is also
// traffic from a living tab. Presence is transport-level knowledge —
// the bridge still never interprets message or event CONTENT.
//
// States: 'unknown' (extension connected, no tab traffic seen yet —
// reports pass through untouched, exactly as before this protocol),
// 'present', 'absent'. Absence is entered via the explicit gone
// (fast path) or when a previously-present tab goes silent for
// PRESENCE_TIMEOUT_MS (default 6000 = 3 missed beats, swept every
// PRESENCE_SWEEP_MS). While absent, apps receive a status report
// SYNTHESIZED from the last real one with every tab-dependent check
// failed — the app's adapter + derivePhase cannot tell it apart from
// a real report, which is the point: no app-side semantics change.
// The real report is kept intact and rebroadcast on recovery.

const PRESENCE_TIMEOUT_MS = Number(process.env.MD_PRESENCE_TIMEOUT_MS ?? 6000);
const PRESENCE_SWEEP_MS = Number(process.env.MD_PRESENCE_SWEEP_MS ?? 500);
const TAB_GONE_DETAIL = 'Muse tab closed or not responding — reopen muse.ai';
const PRESENCE_GATED_CHECKS = [
  'tab',
  'page',
  'auth',
  'composer',
  'messageList',
  'observer',
  'approvals',
  'activity',
  'muse.activityPanel',
];

let presenceState = 'unknown';
let lastBeatAt = 0;

function gatedReport() {
  const base = lastStatusReport ?? { checks: [] };
  const seen = new Set();
  const checks = [];
  for (const c of base.checks ?? []) {
    if (PRESENCE_GATED_CHECKS.includes(c.id)) {
      checks.push({ id: c.id, state: 'fail', detail: TAB_GONE_DETAIL });
    } else {
      checks.push(c);
    }
    seen.add(c.id);
  }
  for (const id of PRESENCE_GATED_CHECKS) {
    if (!seen.has(id)) checks.push({ id, state: 'fail', detail: TAB_GONE_DETAIL });
  }
  return { ...base, checks };
}

function broadcastGatedStatus() {
  broadcastApps({ kind: 'status', report: gatedReport() });
}

function noteTabGone() {
  if (presenceState === 'absent') return;
  presenceState = 'absent';
  broadcastGatedStatus();
  console.log('[bridge] tab presence lost — gating tab-dependent checks');
}

function noteTabAlive() {
  lastBeatAt = Date.now();
  if (presenceState === 'absent') {
    presenceState = 'present';
    // Recovery: the last REAL report is the best evidence until the
    // content script's next probe cycle (≤5s) refreshes it.
    if (lastStatusReport) broadcastApps({ kind: 'status', report: lastStatusReport });
    console.log('[bridge] tab presence recovered');
  } else {
    presenceState = 'present';
  }
}

function resetPresence() {
  presenceState = 'unknown';
  lastBeatAt = 0;
}

const presenceSweeper = setInterval(() => {
  if (presenceState === 'present' && Date.now() - lastBeatAt > PRESENCE_TIMEOUT_MS) {
    noteTabGone();
  }
}, PRESENCE_SWEEP_MS);
presenceSweeper.unref?.();

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcastApps(obj) {
  for (const ws of appConns) send(ws, obj);
}

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  // Origin policy: browsers must come from a local app origin or be the
  // extension (which additionally proves itself with the pairing token).
  const origin = req.headers.origin;
  if (origin && !WS_ORIGIN_OK(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  ws.mdRole = null;
  const helloTimer = setTimeout(() => {
    if (!ws.mdRole) ws.close(4400, 'hello expected');
  }, 5000);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!ws.mdRole) {
      if (msg.kind !== 'hello' || (msg.role !== 'app' && msg.role !== 'extension')) {
        ws.close(4400, 'hello expected');
        return;
      }
      clearTimeout(helloTimer);
      if (msg.role === 'extension') {
        if (msg.token !== PAIRING_TOKEN) {
          ws.close(4401, 'pairing token mismatch');
          console.log('[bridge] extension hello rejected: pairing token mismatch');
          return;
        }
        if (extensionConn && extensionConn !== ws) extensionConn.close(4402, 'replaced');
        extensionConn = ws;
        ws.mdRole = 'extension';
        resetPresence();
        broadcastApps({ kind: 'extension', present: true });
        console.log('[bridge] extension connected');
      } else {
        ws.mdRole = 'app';
        appConns.add(ws);
        send(ws, { kind: 'hello-ack', extensionPresent: !!extensionConn });
        // A fresh app gets the current truth: the gated report while
        // the tab is absent, the last real report otherwise.
        if (presenceState === 'absent') send(ws, { kind: 'status', report: gatedReport() });
        else if (lastStatusReport) send(ws, { kind: 'status', report: lastStatusReport });
        console.log('[bridge] app connected');
      }
      return;
    }

    if (msg.kind === 'ping') {
      send(ws, { kind: 'pong' });
      return;
    }

    if (ws.mdRole === 'extension') {
      if (msg.kind === 'presence') {
        // Consumed here, never relayed: presence is transport-level.
        if (msg.state === 'gone') noteTabGone();
        else noteTabAlive();
      } else if (msg.kind === 'status') {
        // A status report is written by the content script in the tab:
        // it is itself proof the tab is alive.
        lastBeatAt = Date.now();
        presenceState = 'present';
        lastStatusReport = msg.report;
        broadcastApps({ kind: 'status', report: msg.report });
      } else if (msg.kind === 'event') {
        noteTabAlive();
        broadcastApps({ kind: 'event', event: msg.event });
      } else if (msg.kind === 'result') {
        noteTabAlive();
        const target = pendingCommands.get(msg.id);
        if (target) {
          pendingCommands.delete(msg.id);
          send(target, msg);
        }
      }
      return;
    }

    // app frames
    if (msg.kind === 'command') {
      if (!extensionConn) {
        send(ws, {
          kind: 'result',
          id: msg.id,
          ok: false,
          error: { code: 'gone', message: 'No extension is connected to the bridge.' },
        });
        return;
      }
      pendingCommands.set(msg.id, ws);
      send(extensionConn, msg);
    }
  });

  ws.on('close', () => {
    clearTimeout(helloTimer);
    if (ws.mdRole === 'app') {
      appConns.delete(ws);
      for (const [id, target] of pendingCommands) {
        if (target === ws) pendingCommands.delete(id);
      }
    }
    if (ws === extensionConn) {
      extensionConn = null;
      resetPresence();
      broadcastApps({ kind: 'extension', present: false });
      console.log('[bridge] extension disconnected');
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[bridge] listening on http://${HOST}:${PORT} (WebSocket + records), localhost only`);
});
