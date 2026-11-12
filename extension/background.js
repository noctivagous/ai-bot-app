// Mission Desk extension — background service worker.
//
// Owns the bridge WebSocket (the content script never talks to the
// bridge directly in extension mode): connects to ws://127.0.0.1:7701,
// presents the pairing token from chrome.storage.local in its hello
// (DESIGN.md §9 — the token lives here and in the bridge config, never
// in the page), relays status/event frames from the content script, and
// routes command frames from the bridge (i.e. from the app) to the
// registered Muse tab, returning the content script's result.
//
// MV3 caveat, stated plainly: service workers are suspended when idle.
// Chrome wakes this worker on runtime messages from the content script
// and on storage changes; when it restarts it reconnects. A status
// heartbeat may therefore gap — the app shows STALE rather than lying.

const BRIDGE_URL = 'ws://127.0.0.1:7701';

let ws = null;
let wsOpen = false;
let museTabId = null;
let reconnectTimer = null;

async function getToken() {
  try {
    const stored = await chrome.storage.local.get('pairingToken');
    return typeof stored.pairingToken === 'string' && stored.pairingToken ? stored.pairingToken : null;
  } catch {
    return null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, 2000);
}

async function connect() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  const token = await getToken();
  if (!token) {
    wsOpen = false;
    return; // the popup explains: enter the pairing token first
  }
  try {
    ws = new WebSocket(BRIDGE_URL);
  } catch {
    scheduleReconnect();
    return;
  }
  ws.onopen = () => {
    wsOpen = true;
    ws.send(JSON.stringify({ kind: 'hello', role: 'extension', token }));
  };
  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (msg.kind === 'ping') {
      if (wsOpen) ws.send(JSON.stringify({ kind: 'pong' }));
      return;
    }
    if (msg.kind === 'command') {
      void runCommand(msg).then((result) => {
        if (wsOpen && ws) ws.send(JSON.stringify(result));
      });
    }
  };
  ws.onclose = () => {
    wsOpen = false;
    ws = null;
    scheduleReconnect();
  };
  ws.onerror = () => {
    try {
      ws?.close();
    } catch {
      // already closed
    }
  };
}

async function runCommand(cmd) {
  const fail = (code, message) => ({ kind: 'result', id: cmd.id, ok: false, error: { code, message } });
  if (museTabId == null) {
    return fail('gone', 'No Muse tab is registered with the extension — open muse.ai in a tab.');
  }
  try {
    const res = await chrome.tabs.sendMessage(museTabId, { type: 'md-command', command: cmd });
    if (res && res.kind === 'result') return res;
    return fail('gone', 'The content script returned no result.');
  } catch (err) {
    return fail('gone', `Content script unreachable in the Muse tab: ${String(err?.message ?? err)}`);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return undefined;
  if (msg.type === 'md-register') {
    if (sender.tab?.id != null) museTabId = sender.tab.id;
    sendResponse({ ok: true });
    return undefined;
  }
  if (msg.type === 'md-bridge-state') {
    if (!ws && !reconnectTimer) void connect(); // wake-up nudge after suspension
    sendResponse({ open: wsOpen });
    return undefined;
  }
  if (msg.type === 'md-frame') {
    if (wsOpen && ws && msg.frame) ws.send(JSON.stringify(msg.frame));
    sendResponse({ ok: wsOpen });
    return undefined;
  }
  if (msg.type === 'md-state') {
    sendResponse({ bridgeOpen: wsOpen, tabRegistered: museTabId != null });
    return undefined;
  }
  return undefined;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.pairingToken) {
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore
      }
      ws = null;
      wsOpen = false;
    }
    void connect();
  }
});

chrome.runtime.onStartup.addListener(() => void connect());
chrome.runtime.onInstalled.addListener(() => void connect());
void connect();
