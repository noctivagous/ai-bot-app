// MuseAiAdapter — the real adapter (DESIGN.md §9), fuse B.
//
// Talks to the local bridge over one WebSocket. The bridge relays to the
// extension in the muse.ai tab; the content script there runs the §6.2
// probes and mirrors the page. This adapter owns NO page knowledge: it
// merges the extension's check reports into the shared checklist and runs
// them through the SAME derivePhase as the mock (§6.3) — status is
// derived, never asserted. Commands are relayed generically as
// {kind:'command', id, name, args} and the content script's result is
// mapped back, with protocol errors becoming AdapterCommandError.
//
// Page-side events arrive carrying the page's own conversation ref
// ('chat-main' on the fixture); the adapter routes them to the last
// conversation the app opened here (the page shows one conversation at
// a time in v1). Bot finals are deduped by message id (§11 slice 5) so
// app reloads and bridge reconnects never duplicate a message.

import { derivePhase, type ChannelState } from './derivePhase';
import { parseIntents, intentHoldbackLength } from './intents';
import { realScheduler, type Scheduler } from './MockAdapter';
import {
  AdapterCommandError,
  type ActivityPatch,
  type AdapterCheck,
  type AdapterMeta,
  type AdapterStatus,
  type BotEvent,
  type BotServiceAdapter,
  type BotSummary,
  type ChatMsg,
  type ApprovalScope,
  type SurfaceAction,
  type Unsubscribe,
} from './types';
import type { RoutedBotEvent } from './MockAdapter';

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'message' | 'close' | 'error', fn: (ev: { data?: unknown }) => void): void;
}

export interface MuseAiAdapterOptions {
  bridgeUrl?: string;
  webSocketFactory?: (url: string) => WebSocketLike;
  scheduler?: Scheduler;
}

const BOT: BotSummary = {
  id: 'kavi',
  name: 'Kavi',
  code: 'MUSE-01',
  status: 'active',
  desc: 'Your Muse personal agent · muse.ai',
  scheduledCount: 0,
};

const CHECK_DEFS: Array<{ id: string; label: string; required: boolean }> = [
  { id: 'bridge', label: 'Bridge reachable', required: true },
  { id: 'extension', label: 'Extension connected', required: true },
  { id: 'tab', label: 'Muse tab found', required: true },
  { id: 'page', label: 'Muse page ready', required: true },
  { id: 'auth', label: 'Signed in', required: true },
  { id: 'composer', label: 'Composer found', required: true },
  { id: 'messageList', label: 'Message list found', required: true },
  { id: 'observer', label: 'Reply observer armed', required: true },
  { id: 'approvals', label: 'Approval observer', required: false },
  { id: 'activity', label: 'Activity observer', required: false },
  { id: 'muse.activityPanel', label: 'Activity panel observer', required: false },
];

const ACTION_HINTS: Record<string, string> = {
  bridge: 'Start the bridge: npm start in the bridge/ folder, then Reconnect.',
  extension:
    'Install the Mission Desk extension (unpacked, from extension/) and enter the pairing token, then Reconnect.',
  tab: 'Reopen muse.ai in a tab — the app reconnects on its own when the tab returns.',
  auth: 'Open muse.ai and sign in, then Reconnect',
  composer: 'The composer was not found — the muse.ai page may have changed. Reconnect to retry.',
};

const COMMAND_TIMEOUT_MS = 10_000;
const RECONNECT_MS = 2_000;

interface WireCheck {
  id: string;
  state: AdapterCheck['state'];
  detail?: string;
}

interface PendingCommand {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: unknown;
}

export class MuseAiAdapter implements BotServiceAdapter {
  readonly meta: AdapterMeta = { id: 'muse-ai', displayName: 'Muse AI', version: '0.1.0' };

  private readonly bridgeUrl: string;
  private readonly factory: (url: string) => WebSocketLike;
  private readonly scheduler: Scheduler;

  private ws: WebSocketLike | null = null;
  private channel: ChannelState = 'idle';
  private wantConnected = false;
  private everOpened = false;
  private extPresent: boolean | null = null;

  private checks: AdapterCheck[] = [];
  private seq = 0;
  private phaseSince = 0;
  private lastPhase: AdapterStatus['phase'] = 'unconfigured';
  private lastEventAt: number | undefined;
  private identity: { displayName: string } | undefined;
  private status: AdapterStatus;

  private statusListeners = new Set<(s: AdapterStatus) => void>();
  private eventListeners = new Set<(e: BotEvent) => void>();

  private heartbeat: unknown = null;
  private reconnectTimer: unknown = null;
  private cmdSeq = 0;
  private pending = new Map<string, PendingCommand>();
  private sentClientIds = new Set<string>();

  /** The app conversation events are routed to (last opened). */
  private currentConversationId: string | undefined;
  /** Message ids whose final has been delivered — dedupe (§11 slice 5). */
  private finalisedIds = new Set<string>();
  /** Per-message stream accumulation for intent holdback (slice 7). */
  private streamBuffers = new Map<string, { full: string; emitted: number }>();

  constructor(options: MuseAiAdapterOptions = {}) {
    this.bridgeUrl = options.bridgeUrl ?? 'ws://127.0.0.1:7701';
    this.factory =
      options.webSocketFactory ??
      ((url) => new WebSocket(url) as unknown as WebSocketLike);
    this.scheduler = options.scheduler ?? realScheduler;
    this.resetChecks();
    this.phaseSince = this.scheduler.now();
    this.status = this.buildStatus();
  }

  // ---- lifecycle ----

  async connect(): Promise<void> {
    this.wantConnected = true;
    this.openSocket();
    this.startHeartbeat();
  }

  async disconnect(): Promise<void> {
    this.wantConnected = false;
    if (this.reconnectTimer !== null) {
      this.scheduler.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    for (const [, p] of this.pending) {
      this.scheduler.clearTimeout(p.timer);
      p.reject(new AdapterCommandError('gone', this.status.phase, 'Adapter disconnected'));
    }
    this.pending.clear();
    this.ws?.close();
    this.ws = null;
    this.channel = 'closed';
    this.emitStatus();
  }

  private openSocket(): void {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    let ws: WebSocketLike;
    try {
      ws = this.factory(this.bridgeUrl);
    } catch {
      this.failBridge('Could not create a WebSocket to the bridge');
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    let opened = false;
    ws.addEventListener('open', () => {
      opened = true;
      this.everOpened = true;
      this.channel = 'open';
      this.setCheck('bridge', 'pass');
      ws.send(JSON.stringify({ kind: 'hello', role: 'app' }));
      this.lastEventAt = this.scheduler.now();
      this.emitStatus();
    });
    ws.addEventListener('message', (ev) => this.onFrame(ev.data));
    ws.addEventListener('error', () => {
      if (!opened) {
        // Never connected at all: the bridge check failing is the honest
        // state (derivePhase then reports error, not a fake "connecting").
        this.failBridge(`Bridge not reachable at ${this.bridgeUrl}`);
        try {
          ws.close();
        } catch {
          // already closed
        }
      }
    });
    ws.addEventListener('close', () => {
      if (this.ws === ws) this.ws = null;
      // A close ends the 'idle' era for good: checks stay as last
      // reported (they describe the page); the closed channel is what
      // drives 'disconnected', and a failed check still wins ('error').
      this.channel = 'closed';
      this.emitStatus();
      this.scheduleReconnect();
    });
  }

  private failBridge(detail: string): void {
    // A failed first attempt ends the 'idle' era: without this, the
    // one-tick gap between the socket error and its close event would
    // derive 'unconfigured' over a failed required check.
    if (this.channel === 'idle') this.channel = 'closed';
    this.setCheck('bridge', 'fail', detail);
    this.emitStatus();
  }

  private scheduleReconnect(): void {
    if (!this.wantConnected || this.reconnectTimer !== null) return;
    this.reconnectTimer = this.scheduler.setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, RECONNECT_MS);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = this.scheduler.setInterval(() => {
      if (this.ws && this.ws.readyState === 1) {
        try {
          this.ws.send(JSON.stringify({ kind: 'ping' }));
        } catch {
          // socket dying; the close handler will sort it out
        }
      }
      this.emitStatus();
    }, 5000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) {
      this.scheduler.clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  // ---- inbound frames ----

  private onFrame(data: unknown): void {
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(String(data)) as Record<string, unknown>;
    } catch {
      return;
    }
    this.lastEventAt = this.scheduler.now();
    switch (frame.kind) {
      case 'pong':
        break;
      case 'hello-ack':
        this.onExtensionPresence(frame.extensionPresent === true);
        break;
      case 'extension':
        this.onExtensionPresence(frame.present === true);
        break;
      case 'status':
        this.onStatusReport(frame.report as { checks?: WireCheck[]; identity?: { displayName: string } });
        break;
      case 'event':
        this.onWireEvent(frame.event as Record<string, unknown>);
        break;
      case 'result': {
        const p = this.pending.get(String(frame.id));
        if (!p) break;
        this.pending.delete(String(frame.id));
        this.scheduler.clearTimeout(p.timer);
        if (frame.ok === true) p.resolve(frame.data);
        else {
          const err = (frame.error ?? {}) as { code?: string; message?: string };
          const code =
            err.code === 'unsupported' || err.code === 'not-ready' || err.code === 'gone'
              ? err.code
              : 'gone';
          p.reject(
            new AdapterCommandError(code, this.status.phase, err.message ?? 'The page command failed'),
          );
        }
        break;
      }
      default:
        break;
    }
    this.emitStatus();
  }

  private onExtensionPresence(present: boolean): void {
    const was = this.extPresent;
    this.extPresent = present;
    if (present) {
      this.setCheck('extension', 'pass');
    } else if (was === true) {
      // The extension was here and left: say so, and let downstream page
      // checks fall back to waiting for its next report.
      this.setCheck('extension', 'fail', 'The extension disconnected from the bridge');
      for (const id of ['tab', 'page', 'auth', 'composer', 'messageList', 'observer']) {
        this.setCheck(id, 'pending');
      }
    } else {
      this.setCheck(
        'extension',
        'pending',
        'Waiting for the extension to connect to the bridge…',
      );
    }
  }

  private onStatusReport(report?: { checks?: WireCheck[]; identity?: { displayName: string } }): void {
    if (!report) return;
    if (this.extPresent !== true) {
      this.extPresent = true;
      this.setCheck('extension', 'pass');
    }
    for (const wc of report.checks ?? []) {
      // The bridge check is OUR socket, not the content script's report
      // of its own transport — never let the report overwrite it.
      if (wc.id === 'bridge') continue;
      if (!CHECK_DEFS.some((d) => d.id === wc.id)) continue;
      this.setCheck(wc.id, wc.state, wc.detail);
    }
    if (report.identity?.displayName) this.identity = report.identity;
  }

  private onWireEvent(wire: Record<string, unknown> | undefined): void {
    if (!wire || typeof wire.kind !== 'string') return;
    const conv = this.currentConversationId;
    const route = <T extends BotEvent>(e: T): RoutedBotEvent =>
      (conv ? { ...e, conversationId: conv } : e) as RoutedBotEvent;
    switch (wire.kind) {
      case 'bots.changed':
        this.emitEvent({ kind: 'bots.changed', bots: [{ ...BOT, name: this.identity?.displayName ?? BOT.name }] });
        break;
      case 'message.user':
        this.emitEvent(route({ kind: 'message.user', botId: BOT.id, msg: wire.msg as ChatMsg }));
        break;
      case 'message.bot.delta': {
        // Intent holdback (§10/§11 slice 7): deltas accumulate per
        // message and only the prefix that cannot still grow into an
        // ```intent fence is forwarded — a partial fence never reaches
        // the chat display. Once a fence has opened, everything from
        // its start waits for the final (which delivers the clean text
        // and the parsed intents); the app swaps streaming → final, so
        // nothing is lost, just briefly delayed.
        const msgId = String(wire.msgId);
        const buf = this.streamBuffers.get(msgId) ?? { full: '', emitted: 0 };
        buf.full += String(wire.text ?? '');
        let safe = intentHoldbackLength(buf.full);
        const fenceAt = buf.full.indexOf('```intent');
        if (fenceAt >= 0) safe = Math.min(safe, fenceAt);
        if (safe > buf.emitted) {
          const text = buf.full.slice(buf.emitted, safe);
          buf.emitted = safe;
          this.emitEvent(route({ kind: 'message.bot.delta', botId: BOT.id, msgId, text }));
        }
        this.streamBuffers.set(msgId, buf);
        break;
      }
      case 'message.bot.final': {
        const msg = wire.msg as ChatMsg;
        if (!msg?.id || this.finalisedIds.has(msg.id)) break; // dedupe
        this.finalisedIds.add(msg.id);
        this.streamBuffers.delete(msg.id);
        // D4 FOLLOW-UP (FEATURE-MAP S5/D4, decided 2026-11-12): the desk
        // marks interrupted partials (ChatMsg.interrupted), but the
        // correlation is deliberately NOT wired here yet. The client's
        // "Interrupted" verdict lives on the Activity panel entry, which
        // reaches this adapter as an independent `activity` frame: panel
        // entries carry no id linking them to a message (survey S6),
        // routing here is by conversation only (so an unrelated
        // interrupted activity in the same conversation would be a
        // false positive), and there is no ordering guarantee against
        // this settle-driven final — with the app deduping finals by
        // message id, a late-arriving outcome could not amend a final
        // already delivered. A correct wiring needs the content script
        // to link the outcome to the message (or an amend event kind);
        // until then, no heuristic. If the wire msg ever arrives with
        // `interrupted` already stamped, the spread below passes it
        // through unchanged.
        // Parse intents out of the completed text: the final carries
        // the CLEAN text; intents become their own events (§10).
        const parsed = parseIntents(msg.text ?? '');
        this.emitEvent(route({ kind: 'message.bot.final', botId: BOT.id, msg: { ...msg, text: parsed.cleanText } }));
        for (const intent of parsed.schedule) {
          this.emitEvent(route({ kind: 'intent.schedule', botId: BOT.id, intent }));
        }
        for (const wv of parsed.webview) {
          this.emitEvent(route({ kind: 'intent.webview', botId: BOT.id, url: wv.ref, title: wv.title }));
        }
        break;
      }
      case 'message.system':
        this.emitEvent(
          route({ kind: 'message.system', botId: BOT.id, text: String(wire.text ?? ''), ts: String(wire.ts ?? new Date().toISOString()) }),
        );
        break;
      case 'activity': {
        const patch = wire.patch as ActivityPatch | undefined;
        if (!patch?.activityId) break;
        const routed: ActivityPatch = { ...patch, conversationId: conv ?? patch.conversationId };
        this.emitEvent(
          route({ kind: 'activity', botId: BOT.id, widgetId: patch.activityId, patch: routed, transient: true }),
        );
        break;
      }
      case 'approval.request':
        this.emitEvent(
          route({
            kind: 'approval.request',
            botId: BOT.id,
            approval: wire.approval as Extract<BotEvent, { kind: 'approval.request' }>['approval'],
          }),
        );
        break;
      default:
        break;
    }
  }

  // ---- commands ----

  private sendCommand<T>(name: string, args: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) {
        reject(
          new AdapterCommandError('not-ready', this.status.phase, 'The bridge connection is not open'),
        );
        return;
      }
      const id = `cmd-${++this.cmdSeq}`;
      const timer = this.scheduler.setTimeout(() => {
        this.pending.delete(id);
        reject(
          new AdapterCommandError('gone', this.status.phase, `No answer from the page for "${name}" (timed out)`),
        );
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(id, { resolve: (d) => resolve(d as T), reject, timer });
      this.ws.send(JSON.stringify({ kind: 'command', id, name, args }));
    });
  }

  async listBots(): Promise<BotSummary[]> {
    return [{ ...BOT, name: this.identity?.displayName ?? BOT.name }];
  }

  async openConversation(botId: string, conversationId?: string): Promise<ChatMsg[]> {
    if (conversationId) this.currentConversationId = conversationId;
    const data = await this.sendCommand<{ messages?: ChatMsg[] }>('openConversation', { botId });
    return data?.messages ?? [];
  }

  async sendMessage(botId: string, text: string, clientMsgId: string): Promise<void> {
    if (this.sentClientIds.has(clientMsgId)) return; // idempotent (§5.1)
    const phase = this.status.phase;
    if (phase !== 'ready' && phase !== 'degraded') {
      throw new AdapterCommandError('not-ready', phase, `Cannot send while the adapter is ${phase}`);
    }
    this.sentClientIds.add(clientMsgId);
    try {
      await this.sendCommand('sendMessage', { botId, text });
    } catch (err) {
      this.sentClientIds.delete(clientMsgId); // a failed send may be retried
      throw err;
    }
  }

  async invokeAction(botId: string, action: SurfaceAction): Promise<void> {
    const data = await this.sendCommand<{ ack?: string }>('invokeAction', {
      botId,
      actionId: action.id,
      label: action.label,
    });
    this.emitEvent({
      kind: 'action.ack',
      botId,
      actionId: action.id,
      ok: true,
      detail: data?.ack ?? 'Action sent to the chat',
    });
  }

  async resolveApproval(
    botId: string,
    approvalId: string,
    decision: 'allow' | 'deny',
    scope?: ApprovalScope,
  ): Promise<void> {
    await this.sendCommand('resolveApproval', { botId, approvalId, decision, scope });
  }

  // ---- status plumbing ----

  getStatus(): AdapterStatus {
    return this.status;
  }

  onStatus(fn: (s: AdapterStatus) => void): Unsubscribe {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  onEvent(fn: (e: BotEvent) => void): Unsubscribe {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  private resetChecks(): void {
    const now = this.scheduler.now();
    this.checks = CHECK_DEFS.map((d) => ({ ...d, state: 'pending' as const, at: now }));
  }

  private setCheck(id: string, state: AdapterCheck['state'], detail?: string): void {
    const check = this.checks.find((c) => c.id === id);
    if (!check) return;
    check.state = state;
    check.detail = detail;
    check.at = this.scheduler.now();
  }

  private capabilities(): AdapterStatus['capabilities'] {
    const stateOf = (id: string) => this.checks.find((c) => c.id === id)?.state;
    const composerReady = stateOf('composer') === 'pass' && stateOf('messageList') === 'pass';
    return {
      streaming: composerReady,
      listBots: this.extPresent === true,
      approvals: stateOf('approvals') === 'pass',
      activity: stateOf('activity') === 'pass',
      // Slice 7: surface actions ride the send path (content script's
      // documented mapping), and bot-message intents are parsed by this
      // adapter — both are real support now, so the flags say so.
      surfaceActions: composerReady,
      scheduleIntents: composerReady,
      webviewIntents: composerReady,
    };
  }

  private buildStatus(): AdapterStatus {
    const phase = derivePhase(this.checks, this.channel);
    const failed = this.checks.find((c) => c.required && c.state === 'fail');
    return {
      adapterId: this.meta.id,
      adapterVersion: this.meta.version,
      seq: this.seq,
      phase,
      since: this.phaseSince,
      lastEventAt: this.lastEventAt,
      detail: this.detailFor(phase, failed?.id),
      checks: this.checks.map((c) => ({ ...c })),
      identity: this.identity,
      currentBotId: this.wantConnected ? BOT.id : undefined,
      capabilities: this.capabilities(),
      error:
        phase === 'error' && failed
          ? {
              code: failed.id,
              message: failed.detail ?? `${failed.label} failed`,
              recoverable: true,
              actionHint: ACTION_HINTS[failed.id] ?? 'Reconnect to retry.',
            }
          : undefined,
    };
  }

  private detailFor(phase: AdapterStatus['phase'], failedCheckId?: string): string {
    switch (phase) {
      case 'unconfigured':
        return 'Adapter constructed; connect() has not been called.';
      case 'connecting':
        return this.extPresent
          ? 'Extension connected — waiting for the page checks from the Muse tab…'
          : 'Connecting — waiting for the extension to reach the bridge (is muse.ai open?)…';
      case 'ready':
        return 'Connected to Muse via the local bridge + extension. All checks pass.';
      case 'degraded':
        return 'Connected, but an optional observer is unavailable.';
      case 'disconnected':
        return 'The bridge connection was lost. Reconnecting automatically…';
      case 'error':
        return failedCheckId === 'bridge'
          ? 'The local bridge is not reachable.'
          : failedCheckId === 'auth'
            ? 'Not signed in to muse.ai.'
            : 'A required check failed — see the checklist.';
    }
  }

  private emitStatus(): void {
    const next = this.buildStatus();
    if (next.phase !== this.lastPhase) {
      this.phaseSince = this.scheduler.now();
      this.lastPhase = next.phase;
      next.since = this.phaseSince;
    }
    next.seq = ++this.seq;
    this.status = next;
    for (const fn of [...this.statusListeners]) fn(next);
  }

  private emitEvent(e: BotEvent): void {
    for (const fn of [...this.eventListeners]) fn(e);
  }
}
