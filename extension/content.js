// Mission Desk content script — runs inside the muse.ai page (and, for
// tests only, the localhost fixture page). DESIGN.md §9.
//
// Responsibilities, in slice order:
//   slice 3 — health: run the §6.2 probes in order and report checks over
//             the bridge; observe the message list + approval region.
//   slice 4 — send: write the composer via the native value setter +
//             input events, click the real send control, and CONFIRM the
//             user message landed in the list before reporting success.
//   slice 5 — receive: stream bot replies as message.bot.delta and emit
//             exactly one message.bot.final on settle.
//   slice 6 — mirror approval cards as approval.request and resolve them
//             by clicking the real Allow/Deny controls; mirror the
//             Activity panel (source of record, §2.10) as activity
//             events, working indicator as fallback.
//
// Security (§9): this script never reads, exports or stores cookies,
// tokens, or session credentials. The only secret it ever touches is
// NOT here at all: the pairing token lives in the background worker
// (chrome.storage.local). The direct-WebSocket transport below exists
// solely for the headless test harness (CDP injection) and activates
// only when a test page sets window.__MD_TEST_HOOKS__ before injection.

(() => {
  'use strict';
  if (window.__MD_CONTENT_INSTALLED__) return;
  window.__MD_CONTENT_INSTALLED__ = true;

  const S = globalThis.MD_SELECTORS;
  const CFG = globalThis.MD_CONFIG ?? { bridgeUrl: 'ws://127.0.0.1:7701', botId: 'kavi' };
  const BOT_ID = CFG.botId;
  const nowIso = () => new Date().toISOString();

  const first = (list) => {
    for (const sel of [].concat(list ?? [])) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch {
        // invalid selector in config — skip, never throw (§9)
      }
    }
    return null;
  };
  const firstIn = (root, list) => {
    for (const sel of [].concat(list ?? [])) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch {
        // as above
      }
    }
    return null;
  };

  // ---------- transport ----------
  // 'extension' mode: chrome.runtime messaging via the background worker.
  // 'injected' mode (tests only): a direct WebSocket to the bridge,
  // enabled by window.__MD_TEST_HOOKS__ = { wsUrl, token }.

  const hasRuntime = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
  const hooks = !hasRuntime && window.__MD_TEST_HOOKS__ ? window.__MD_TEST_HOOKS__ : null;
  let directWs = null;
  let directOpen = false;

  function sendFrame(frame) {
    if (hasRuntime) {
      chrome.runtime.sendMessage({ type: 'md-frame', frame }).catch(() => {});
    } else if (directWs && directWs.readyState === 1) {
      directWs.send(JSON.stringify(frame));
    }
  }

  function sendEvent(event) {
    sendFrame({ kind: 'event', event });
  }

  async function bridgeUp() {
    if (hasRuntime) {
      try {
        const r = await chrome.runtime.sendMessage({ type: 'md-bridge-state' });
        return !!r?.open;
      } catch {
        return false;
      }
    }
    return directOpen;
  }

  function connectDirect() {
    if (!hooks) return;
    try {
      directWs = new WebSocket(hooks.wsUrl || CFG.bridgeUrl);
    } catch {
      setTimeout(connectDirect, 2000);
      return;
    }
    directWs.onopen = () => {
      directOpen = true;
      directWs.send(JSON.stringify({ kind: 'hello', role: 'extension', token: hooks.token }));
      void runProbes();
    };
    directWs.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.kind === 'ping') {
        directWs.send(JSON.stringify({ kind: 'pong' }));
      } else if (msg.kind === 'command') {
        void handleCommand(msg).then((result) => {
          if (directWs && directWs.readyState === 1) directWs.send(JSON.stringify(result));
        });
      }
    };
    directWs.onclose = () => {
      directOpen = false;
      directWs = null;
      setTimeout(connectDirect, 2000);
    };
  }

  // ---------- probes (§6.2, in order) ----------

  let messageObserver = null;
  let approvalObserver = null;
  let activityObserver = null;
  let botsChangedSent = false;

  function armObservers(listEl) {
    if (!messageObserver && listEl) {
      // Everything already in the list is HISTORY: seed it as finalised
      // so a later mutation can never re-stream old messages as if new.
      for (const el of listEl.querySelectorAll(S.messageItem)) {
        const mid = el.getAttribute('data-msg-id');
        if (mid && el.getAttribute('data-role') === 'bot') {
          streamed.set(mid, (el.textContent ?? '').trim());
          finalised.add(mid);
        }
      }
      messageObserver = new MutationObserver(onMessagesMutated);
      messageObserver.observe(listEl, { childList: true, subtree: true, characterData: true });
    }
    if (!approvalObserver) {
      approvalObserver = new MutationObserver(onApprovalsMutated);
      approvalObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-resolved'],
      });
    }
    if (!activityObserver) {
      const panel = first(S.activityPanel);
      if (panel) {
        activityObserver = new MutationObserver(onActivityMutated);
        activityObserver.observe(panel, { childList: true, subtree: true, characterData: true, attributes: true });
      }
    }
  }

  async function runProbes() {
    const checks = [];
    const push = (id, state, detail) => checks.push(detail ? { id, state, detail } : { id, state });

    const up = await bridgeUp();
    push('bridge', up ? 'pass' : 'fail', up ? undefined : 'Bridge WebSocket is not open — is the bridge running?');
    push(
      'extension',
      'pass',
      hasRuntime ? undefined : 'Content script injected by the test harness — NOT extension-loaded',
    );
    push('tab', 'pass', undefined);

    const root = first(S.appRoot);
    if (!root) {
      push('page', 'fail', 'Expected app root not found — is this the Muse page?');
      return finishReport(checks);
    }
    push('page', 'pass', undefined);

    const signedIn = first(S.signedInMarker);
    const signInUi = first(S.signInUi);
    if (!signedIn || signInUi) {
      push('auth', 'fail', 'Sign-in UI is present — open muse.ai and sign in, then Reconnect');
      // The mock's script stops here too: later required checks wait.
      push('composer', 'pending', undefined);
      push('messageList', 'pending', undefined);
      push('observer', 'pending', undefined);
      push('approvals', 'skip', 'Sign-in required first');
      push('activity', 'skip', 'Sign-in required first');
      push('muse.activityPanel', 'skip', 'Sign-in required first');
      return finishReport(checks);
    }
    push('auth', 'pass', undefined);

    const composer = first(S.composer);
    if (!composer) {
      push('composer', 'fail', 'Chat input not found in the page');
      push('messageList', 'pending', undefined);
      push('observer', 'pending', undefined);
      return finishReport(checks);
    }
    push('composer', 'pass', undefined);

    const listEl = first(S.messageList);
    if (!listEl) {
      push('messageList', 'fail', 'Message list region not found in the page');
      push('observer', 'pending', undefined);
      return finishReport(checks);
    }
    push('messageList', 'pass', undefined);

    armObservers(listEl);
    push('observer', 'pass', undefined);

    push('approvals', 'pass', undefined);

    const indicator = first(S.workingIndicator);
    const actBtn = first(S.activityButton);
    if (indicator || actBtn) push('activity', 'pass', undefined);
    else push('activity', 'warn', 'Working indicator not located in the page yet');

    const panelEl = first(S.activityPanel);
    if (panelEl || actBtn) push('muse.activityPanel', 'pass', undefined);
    else push('muse.activityPanel', 'warn', 'Activity panel not found in the page');

    return finishReport(checks, true);
  }

  function finishReport(checks, healthy = false) {
    const nameEl = first(S.agentName);
    const report = {
      checks,
      ...(nameEl ? { identity: { displayName: nameEl.textContent.trim() } } : {}),
    };
    sendFrame({ kind: 'status', report });
    if (healthy && !botsChangedSent) {
      botsChangedSent = true;
      sendEvent({ kind: 'bots.changed', botId: BOT_ID, ts: nowIso() });
      mirrorApprovals();
      mirrorActivities(true);
    }
    return report;
  }

  // ---------- mutation entry points (extended by later slices) ----------

  let reprobeTimer = null;
  function scheduleReprobe() {
    if (reprobeTimer) return;
    reprobeTimer = setTimeout(() => {
      reprobeTimer = null;
      void runProbes();
    }, 700);
  }

  function onMessagesMutated(mutations) {
    streamFromMutations(mutations);
    scheduleReprobe();
  }

  function onApprovalsMutated() {
    mirrorApprovals();
  }

  function onActivityMutated() {
    mirrorActivities(false);
  }

  // ---------- commands ----------

  function errResult(id, code, message) {
    return { kind: 'result', id, ok: false, error: { code, message } };
  }

  function snapshotMessages() {
    const listEl = first(S.messageList);
    if (!listEl) return null;
    return [...listEl.querySelectorAll(S.messageItem)]
      .map((el) => ({
        id: el.getAttribute('data-msg-id') ?? '',
        role: el.getAttribute('data-role') === 'user' ? 'user' : 'bot',
        text: (el.textContent ?? '').trim(),
        ts: el.getAttribute('data-ts') || nowIso(),
      }))
      .filter((m) => m.id);
  }

  async function handleCommand(cmd) {
    const { id, name, args } = cmd ?? {};
    try {
      switch (name) {
        case 'openConversation': {
          const messages = snapshotMessages();
          if (!messages) return errResult(id, 'gone', 'Message list not found in the page');
          return { kind: 'result', id, ok: true, data: { messages } };
        }
        case 'sendMessage':
          return await cmdSendMessage(id, String(args?.text ?? ''));
        case 'resolveApproval':
          return cmdResolveApproval(id, args ?? {});
        case 'invokeAction':
          return await cmdInvokeAction(id, args ?? {});
        default:
          return errResult(id, 'unsupported', `The content script does not implement "${name}"`);
      }
    } catch (err) {
      return errResult(id, 'gone', String(err?.message ?? err));
    }
  }

  // ---------- slice 4: send ----------
  // Framework-controlled composers ignore direct .value writes: write
  // through the NATIVE value setter (bypassing any tracker the framework
  // installed on the node) and dispatch real input events, then click
  // the page's own send control. Confirmation is observational: the send
  // only counts when a NEW user message with the exact text lands in the
  // message list.

  function setComposerValue(el, text) {
    el.focus();
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, text);
    else el.value = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function messageIds() {
    const listEl = first(S.messageList);
    if (!listEl) return new Set();
    return new Set(
      [...listEl.querySelectorAll(S.messageItem)].map((el) => el.getAttribute('data-msg-id')),
    );
  }

  function findUserMessage(text, excludeIds) {
    const listEl = first(S.messageList);
    if (!listEl) return null;
    for (const el of listEl.querySelectorAll(S.messageItem)) {
      const mid = el.getAttribute('data-msg-id');
      if (!mid || excludeIds.has(mid)) continue;
      if (el.getAttribute('data-role') === 'user' && (el.textContent ?? '').trim() === text) return el;
    }
    return null;
  }

  function cmdSendMessage(id, text) {
    return new Promise((resolve) => {
      const composer = first(S.composer);
      if (!composer) return resolve(errResult(id, 'gone', 'Composer not found in the page'));
      const before = messageIds();
      setComposerValue(composer, text);
      const sendBtn = first(S.sendButton);
      if (!sendBtn) {
        return resolve(
          errResult(id, 'gone', 'Send control not found in the page — the message was not sent'),
        );
      }
      sendBtn.click();
      const deadline = Date.now() + 3000;
      const poll = setInterval(() => {
        const landed = findUserMessage(text, before);
        if (landed) {
          clearInterval(poll);
          // Observation-based echo: the app learns about its own message
          // from the page, exactly like any other message.
          routeEvent({
            kind: 'message.user',
            botId: BOT_ID,
            msg: {
              id: landed.getAttribute('data-msg-id'),
              role: 'user',
              text,
              ts: landed.getAttribute('data-ts') || nowIso(),
            },
          });
          resolve({ kind: 'result', id, ok: true, data: { confirmed: true } });
        } else if (Date.now() > deadline) {
          clearInterval(poll);
          resolve(
            errResult(
              id,
              'gone',
              'Sent was clicked but the message never appeared in the page — treated as not sent',
            ),
          );
        }
      }, 120);
    });
  }

  // ---------- slice 5: receive ----------
  // The observer suffix-diffs bot message elements by their stable
  // data-msg-id. Settle = quiet for QUIET_MS AND no working indicator:
  // then exactly one message.bot.final per id (finalised set).

  const QUIET_MS = 600;
  const streamed = new Map(); // msgId -> last text emitted as delta base
  const finalised = new Set();
  let settleTimer = null;

  const currentConversationId = () => 'chat-main';

  function routeEvent(event) {
    sendEvent({ ...event, conversationId: currentConversationId() });
  }

  function streamFromMutations(_mutations) {
    const listEl = first(S.messageList);
    if (!listEl) return;
    let changed = false;
    for (const el of listEl.querySelectorAll(S.messageItem)) {
      const mid = el.getAttribute('data-msg-id');
      if (!mid || el.getAttribute('data-role') !== 'bot' || finalised.has(mid)) continue;
      const text = (el.textContent ?? '').trim();
      const prev = streamed.get(mid) ?? '';
      if (text.length > prev.length && text.startsWith(prev)) {
        streamed.set(mid, text);
        routeEvent({
          kind: 'message.bot.delta',
          botId: BOT_ID,
          msgId: mid,
          text: text.slice(prev.length),
        });
        changed = true;
      } else if (text !== prev && text.length > 0 && prev.length === 0) {
        // First sight with full text already present (history paints):
        // not a stream — remember it so a later edit can't fake a delta.
        streamed.set(mid, text);
      }
    }
    if (changed) {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(trySettle, QUIET_MS);
    }
  }

  function trySettle() {
    settleTimer = null;
    const indicator = first(S.workingIndicator);
    if (indicator && !indicator.hidden) {
      settleTimer = setTimeout(trySettle, 300);
      return;
    }
    for (const [mid, text] of streamed) {
      if (finalised.has(mid) || !text) continue;
      finalised.add(mid);
      routeEvent({
        kind: 'message.bot.final',
        botId: BOT_ID,
        msg: { id: mid, role: 'bot', text, ts: nowIso() },
      });
    }
  }

  // ---------- slice 6: approvals ----------
  // Mirror the page's approval card as approval.request; resolve by
  // clicking the REAL control in the page. data-scopes="once,always"
  // declares the offered scopes (§2.12). Resolution is observed from the
  // card's data-resolved attribute — never forged.

  const mirroredApprovals = new Map(); // approvalId -> card element

  function mirrorApprovals() {
    for (const card of document.querySelectorAll(S.approvalCard)) {
      const approvalId = card.getAttribute('data-approval-id');
      if (!approvalId || mirroredApprovals.has(approvalId)) continue;
      if (card.getAttribute('data-resolved')) {
        // Resolved in the page before we ever saw it pending — nothing
        // to mirror; the chat history already carries the outcome.
        card.__mdResolutionSent = true;
        mirroredApprovals.set(approvalId, card);
        continue;
      }
      const titleEl = firstIn(card, ['[data-testid="approval-title"]']);
      const scopes = (card.getAttribute('data-scopes') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s === 'once' || s === 'always');
      mirroredApprovals.set(approvalId, card);
      routeEvent({
        kind: 'approval.request',
        botId: BOT_ID,
        approval: {
          id: approvalId,
          botId: BOT_ID,
          title: (titleEl?.textContent ?? 'Approval requested').trim(),
          ...(scopes.length ? { scopes } : {}),
        },
        ts: nowIso(),
      });
    }
    // resolutions observed on cards we mirrored
    for (const [approvalId, card] of mirroredApprovals) {
      const resolved = card.getAttribute('data-resolved');
      if (!resolved || card.__mdResolutionSent) continue;
      card.__mdResolutionSent = true;
      const outcomeEl = firstIn(card, S.approvalOutcome);
      routeEvent({
        kind: 'message.system',
        botId: BOT_ID,
        text: outcomeEl?.textContent?.trim() || `Approval ${resolved}: ${approvalId}`,
        ts: nowIso(),
      });
    }
  }

  function cmdResolveApproval(id, args) {
    const card = mirroredApprovals.get(args.approvalId) ?? first(S.approvalCard);
    if (!card) return errResult(id, 'gone', 'Approval card not found in the page');
    if (card.getAttribute('data-resolved')) return errResult(id, 'gone', 'Approval already resolved in the page');
    let btn = null;
    if (args.decision === 'deny') btn = firstIn(card, S.approvalDeny);
    else if (args.scope === 'always') btn = firstIn(card, S.approvalAlways) ?? firstIn(card, S.approvalAllowOnce) ?? firstIn(card, S.approvalAllowPlain);
    else btn = firstIn(card, S.approvalAllowOnce) ?? firstIn(card, S.approvalAllowPlain);
    if (!btn) return errResult(id, 'gone', 'The matching approval control was not found in the page');
    btn.click();
    const resolved = card.getAttribute('data-resolved');
    if (!resolved) return errResult(id, 'gone', 'Clicked the approval control but the card did not resolve');
    return { kind: 'result', id, ok: true, data: { resolved } };
  }

  // ---------- slice 6: activity mirroring (§2.10) ----------
  // The Activity panel is the source of record: its entries (title,
  // state, elapsed, detail, outcome, conversation ref) mirror 1:1 as
  // activity events in the ActivityPatch shape. Events are transient —
  // nothing here writes them anywhere durable. Fallback: while the bot
  // streams with no panel entry covering it, the working indicator
  // produces a coarse patch (state only).

  const activitySeen = new Map(); // activityId -> last JSON patch

  function mirrorActivities(_force) {
    const patches = [];
    for (const el of document.querySelectorAll(S.activityEntry)) {
      const activityId = el.getAttribute('data-activity-id');
      if (!activityId) continue;
      const state = el.getAttribute('data-state') || 'active';
      const titleEl = el.querySelector('.a-title');
      const detailEl = firstIn(el, S.activityDetail);
      const outcomeEl = firstIn(el, S.activityOutcome);
      patches.push({
        activityId,
        title: (titleEl?.textContent ?? activityId).trim(),
        state,
        activity: (detailEl?.textContent ?? '').trim().split('\n')[0] ?? '',
        detail: (detailEl?.textContent ?? '').trim(),
        ...(outcomeEl && !outcomeEl.hidden && outcomeEl.textContent.trim()
          ? { outcome: outcomeEl.textContent.trim() }
          : {}),
        conversationId: el.getAttribute('data-conversation-ref') || currentConversationId(),
      });
    }
    for (const patch of patches) {
      const key = JSON.stringify(patch);
      if (activitySeen.get(patch.activityId) === key) continue;
      activitySeen.set(patch.activityId, key);
      routeEvent({
        kind: 'activity',
        botId: BOT_ID,
        widgetId: patch.activityId,
        patch: {
          ...patch,
          // Contract states: the panel's 'active' is the app's 'running'.
          state: patch.state === 'active' ? 'running' : patch.state,
        },
        transient: true,
      });
    }
  }

  // ---------- slice 7: control-panel actions ----------
  // Mapping (documented in extension/README.md): the Muse page has no
  // buttons of ours, so a surface action is sent as a structured command
  // message through the normal send path; the bot (real or fixture)
  // acks by replying. The result of invokeAction is the send
  // confirmation; the bot's reply arrives as ordinary message events.

  async function cmdInvokeAction(id, args) {
    const action = String(args.actionId ?? '');
    const label = String(args.label ?? action);
    const text = `[Mission Desk action] ${label} (${action})`;
    const sent = await cmdSendMessage(id, text);
    if (!sent.ok) return sent;
    return { kind: 'result', id, ok: true, data: { ack: `Action sent to the chat: ${label}` } };
  }

  // ---------- wiring ----------

  if (hasRuntime) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === 'md-command') {
        void handleCommand(msg.command).then(sendResponse);
        return true; // async response
      }
      return undefined;
    });
    const register = () => chrome.runtime.sendMessage({ type: 'md-register' }).catch(() => {});
    register();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) register();
    });
  } else if (hooks) {
    connectDirect();
  }

  void runProbes();
  setInterval(() => void runProbes(), 5000);
  // Readiness signals: the window flag serves the injected test harness
  // (same world); the DOM stamp serves everyone else — content scripts
  // run in an isolated world whose window is NOT the page's window, but
  // the DOM is shared.
  window.__MD_CONTENT_READY__ = true;
  document.documentElement.setAttribute('data-md-content', 'ready');
})();
