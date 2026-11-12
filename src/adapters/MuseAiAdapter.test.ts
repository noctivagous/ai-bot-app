// MuseAiAdapter tests — a stub WebSocket stands in for the bridge;
// frames are fed by hand. The FakeScheduler from the mock tests drives
// heartbeat/reconnect timing: no real timers, no network.

import { describe, it, expect } from 'vitest';
import { MuseAiAdapter, type WebSocketLike } from './MuseAiAdapter';
import { FakeScheduler } from './FakeScheduler';
import { AdapterCommandError, type BotEvent } from './types';

class StubSocket implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  private listeners = new Map<string, Array<(ev: { data?: unknown }) => void>>();

  addEventListener(type: 'open' | 'message' | 'close' | 'error', fn: (ev: { data?: unknown }) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
    this.fire('close', {});
  }
  fire(type: string, ev: { data?: unknown }): void {
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
  open(): void {
    this.readyState = 1;
    this.fire('open', {});
  }
  frame(obj: unknown): void {
    this.fire('message', { data: JSON.stringify(obj) });
  }
  framesOf(kind: string): Array<Record<string, unknown>> {
    return this.sent.map((s) => JSON.parse(s)).filter((f) => f.kind === kind);
  }
}

function makeAdapter() {
  const scheduler = new FakeScheduler();
  const sockets: StubSocket[] = [];
  const adapter = new MuseAiAdapter({
    scheduler,
    webSocketFactory: () => {
      const s = new StubSocket();
      sockets.push(s);
      return s;
    },
  });
  const events: BotEvent[] = [];
  adapter.onEvent((e) => events.push(e));
  return { adapter, scheduler, sockets, events };
}

const FULL_REPORT = {
  checks: [
    { id: 'bridge', state: 'pass' },
    { id: 'extension', state: 'pass' },
    { id: 'tab', state: 'pass' },
    { id: 'page', state: 'pass' },
    { id: 'auth', state: 'pass' },
    { id: 'composer', state: 'pass' },
    { id: 'messageList', state: 'pass' },
    { id: 'observer', state: 'pass' },
    { id: 'approvals', state: 'pass' },
    { id: 'activity', state: 'pass' },
    { id: 'muse.activityPanel', state: 'pass' },
  ],
  identity: { displayName: 'Kavi' },
};

async function driveToReady(ctx: ReturnType<typeof makeAdapter>) {
  await ctx.adapter.connect();
  const ws = ctx.sockets[0]!;
  ws.open();
  ws.frame({ kind: 'hello-ack', extensionPresent: true });
  ws.frame({ kind: 'status', report: FULL_REPORT });
  return ws;
}

describe('MuseAiAdapter status (same derivePhase as the mock)', () => {
  it('starts unconfigured; connect + socket open sends hello and waits on the extension', async () => {
    const { adapter, sockets } = makeAdapter();
    expect(adapter.getStatus().phase).toBe('unconfigured');
    await adapter.connect();
    const ws = sockets[0]!;
    ws.open();
    expect(ws.framesOf('hello')).toEqual([{ kind: 'hello', role: 'app' }]);
    const st = adapter.getStatus();
    expect(st.phase).toBe('connecting');
    expect(st.checks.find((c) => c.id === 'bridge')?.state).toBe('pass');
    expect(st.adapterId).toBe('muse-ai');
  });

  it('a full extension report derives ready, with identity and the activityPanel check', async () => {
    const ctx = makeAdapter();
    await driveToReady(ctx);
    const st = ctx.adapter.getStatus();
    expect(st.phase).toBe('ready');
    expect(st.checks).toHaveLength(11);
    expect(st.checks.every((c) => c.state === 'pass')).toBe(true);
    expect(st.identity).toEqual({ displayName: 'Kavi' });
    expect(st.capabilities).toMatchObject({ streaming: true, listBots: true, approvals: true, activity: true });
  });

  it('an optional warn in the report derives degraded', async () => {
    const ctx = makeAdapter();
    await ctx.adapter.connect();
    const ws = ctx.sockets[0]!;
    ws.open();
    ws.frame({ kind: 'hello-ack', extensionPresent: true });
    const report = structuredClone(FULL_REPORT);
    report.checks.find((c) => c.id === 'approvals')!.state = 'warn';
    ws.frame({ kind: 'status', report });
    expect(ctx.adapter.getStatus().phase).toBe('degraded');
    expect(ctx.adapter.getStatus().capabilities.approvals).toBe(false);
  });

  it('bridge unreachable: socket error before open derives error with a bridge hint', async () => {
    const { adapter, sockets } = makeAdapter();
    await adapter.connect();
    const ws = sockets[0]!;
    ws.fire('error', {});
    const st = adapter.getStatus();
    expect(st.phase).toBe('error');
    expect(st.error?.code).toBe('bridge');
    expect(st.error?.actionHint).toContain('npm start');
  });

  it('socket close after ready derives disconnected, checks preserved', async () => {
    const ctx = makeAdapter();
    const ws = await driveToReady(ctx);
    ws.close();
    const st = ctx.adapter.getStatus();
    expect(st.phase).toBe('disconnected');
    expect(st.checks.find((c) => c.id === 'auth')?.state).toBe('pass');
  });

  it('signed-out report (auth fail) derives error with the sign-in hint', async () => {
    const ctx = makeAdapter();
    await ctx.adapter.connect();
    const ws = ctx.sockets[0]!;
    ws.open();
    ws.frame({ kind: 'hello-ack', extensionPresent: true });
    const report = structuredClone(FULL_REPORT);
    for (const c of report.checks) {
      if (c.id === 'auth') c.state = 'fail';
      if (['composer', 'messageList', 'observer'].includes(c.id)) c.state = 'pending';
    }
    ws.frame({ kind: 'status', report });
    const st = ctx.adapter.getStatus();
    expect(st.phase).toBe('error');
    expect(st.error?.code).toBe('auth');
    expect(st.error?.actionHint).toContain('sign in');
  });

  it('extension leaving after ready fails the extension check (error, not silence)', async () => {
    const ctx = makeAdapter();
    const ws = await driveToReady(ctx);
    ws.frame({ kind: 'extension', present: false });
    const st = ctx.adapter.getStatus();
    expect(st.phase).toBe('error');
    expect(st.checks.find((c) => c.id === 'extension')?.state).toBe('fail');
  });
});

describe('MuseAiAdapter commands + events', () => {
  it('openConversation relays a command and returns the page snapshot; routing sticks', async () => {
    const ctx = makeAdapter();
    const ws = await driveToReady(ctx);
    const p = ctx.adapter.openConversation('kavi', 'conv-ansci');
    const cmd = ws.framesOf('command').at(-1)!;
    expect(cmd.name).toBe('openConversation');
    ws.frame({
      kind: 'result',
      id: cmd.id,
      ok: true,
      data: { messages: [{ id: 'm1', role: 'bot', text: 'hi', ts: '2026-11-11T00:00:00.000Z' }] },
    });
    await expect(p).resolves.toEqual([{ id: 'm1', role: 'bot', text: 'hi', ts: '2026-11-11T00:00:00.000Z' }]);
    // inbound events route to the opened conversation
    ws.frame({ kind: 'event', event: { kind: 'message.system', botId: 'kavi', text: 'note', ts: 'x' } });
    const sys = ctx.events.find((e) => e.kind === 'message.system') as { conversationId?: string };
    expect(sys.conversationId).toBe('conv-ansci');
  });

  it('a typed error result rejects with AdapterCommandError carrying the code', async () => {
    const ctx = makeAdapter();
    const ws = await driveToReady(ctx);
    const p = ctx.adapter.sendMessage('kavi', 'hello', 'cm-1');
    const cmd = ws.framesOf('command').at(-1)!;
    ws.frame({ kind: 'result', id: cmd.id, ok: false, error: { code: 'gone', message: 'Send control not found' } });
    await expect(p).rejects.toMatchObject({ name: 'AdapterCommandError', code: 'gone' });
  });

  it('sendMessage is gated by phase and idempotent by clientMsgId', async () => {
    const ctx = makeAdapter();
    await expect(ctx.adapter.sendMessage('kavi', 'x', 'cm-0')).rejects.toBeInstanceOf(AdapterCommandError);
    const ws = await driveToReady(ctx);
    const p1 = ctx.adapter.sendMessage('kavi', 'hello', 'cm-9');
    const cmd = ws.framesOf('command').at(-1)!;
    ws.frame({ kind: 'result', id: cmd.id, ok: true, data: { confirmed: true } });
    await p1;
    await ctx.adapter.sendMessage('kavi', 'hello', 'cm-9'); // duplicate — no second command
    expect(ws.framesOf('command').filter((c) => c.name === 'sendMessage')).toHaveLength(1);
  });

  it('bot finals are deduped by message id; activity patches are routed + conversation-rewritten', async () => {
    const ctx = makeAdapter();
    const ws = await driveToReady(ctx);
    const openP = ctx.adapter.openConversation('kavi', 'conv-main');
    const openCmd = ws.framesOf('command').at(-1)!;
    ws.frame({ kind: 'result', id: openCmd.id, ok: true, data: { messages: [] } });
    await openP;
    const final = {
      kind: 'event',
      event: { kind: 'message.bot.final', botId: 'kavi', msg: { id: 'fx-bot-9', role: 'bot', text: 'done', ts: 't' } },
    };
    ws.frame(final);
    ws.frame(final);
    expect(ctx.events.filter((e) => e.kind === 'message.bot.final')).toHaveLength(1);
    ws.frame({
      kind: 'event',
      event: {
        kind: 'activity',
        botId: 'kavi',
        widgetId: 'act-1',
        patch: { conversationId: 'chat-main', activityId: 'act-1', state: 'running', activity: 'Working' },
        transient: true,
      },
    });
    const act = ctx.events.find((e) => e.kind === 'activity');
    expect(act).toMatchObject({ kind: 'activity', patch: { conversationId: 'conv-main' } });
  });

  it('resolveApproval relays decision + scope (§2.12)', async () => {
    const ctx = makeAdapter();
    const ws = await driveToReady(ctx);
    const p = ctx.adapter.resolveApproval('kavi', 'appr-1', 'allow', 'always');
    const cmd = ws.framesOf('command').at(-1)!;
    expect(cmd.name).toBe('resolveApproval');
    expect(cmd.args).toMatchObject({ approvalId: 'appr-1', decision: 'allow', scope: 'always' });
    ws.frame({ kind: 'result', id: cmd.id, ok: true, data: { resolved: 'allow-always' } });
    await expect(p).resolves.toBeUndefined();
  });

  it('slice 7: capabilities report surfaceActions + intents once the composer checks pass', async () => {
    const ctx = makeAdapter();
    await driveToReady(ctx);
    expect(ctx.adapter.getStatus().capabilities).toMatchObject({
      surfaceActions: true,
      scheduleIntents: true,
      webviewIntents: true,
    });
  });

  it('slice 7: delta holdback never streams a partial intent fence; the final is clean and intents are emitted', async () => {
    const ctx = makeAdapter();
    const ws = await driveToReady(ctx);
    const openP = ctx.adapter.openConversation('kavi', 'conv-main');
    const openCmd = ws.framesOf('command').at(-1)!;
    ws.frame({ kind: 'result', id: openCmd.id, ok: true, data: { messages: [] } });
    await openP;

    const wire = (kind: string, extra: Record<string, unknown>) =>
      ws.frame({ kind: 'event', event: { kind, botId: 'kavi', ...extra } });
    // The fence is split across two deltas, mid-keyword.
    wire('message.bot.delta', { msgId: 'fx-bot-7', text: 'Here is a proposed session. ```int' });
    wire('message.bot.delta', {
      msgId: 'fx-bot-7',
      text: 'ent\n{"type":"schedule","title":"Fixture planning session","day":2,"project":"Chinese Book"}\n```',
    });
    const streamed = ctx.events
      .filter((e) => e.kind === 'message.bot.delta')
      .map((e) => (e.kind === 'message.bot.delta' ? e.text : ''))
      .join('');
    expect(streamed).toBe('Here is a proposed session. ');
    expect(streamed).not.toContain('`');

    wire('message.bot.final', {
      msg: {
        id: 'fx-bot-7',
        role: 'bot',
        ts: 't',
        text: 'Here is a proposed session.\n\n```intent\n{"type":"schedule","title":"Fixture planning session","day":2,"project":"Chinese Book"}\n```\n\n```intent\n{"type":"webview","title":"Map","ref":"art-chinese-map"}\n```',
      },
    });
    const final = ctx.events.find((e) => e.kind === 'message.bot.final');
    expect(final).toMatchObject({ kind: 'message.bot.final', msg: { text: 'Here is a proposed session.' } });
    expect(ctx.events.find((e) => e.kind === 'intent.schedule')).toMatchObject({
      kind: 'intent.schedule',
      intent: { title: 'Fixture planning session', day: 2, projectName: 'Chinese Book' },
    });
    expect(ctx.events.find((e) => e.kind === 'intent.webview')).toMatchObject({
      kind: 'intent.webview',
      url: 'art-chinese-map',
    });
  });

  it('D4 follow-up: a wire message.bot.amend is translated and conversation-routed', async () => {
    const ctx = makeAdapter();
    const ws = await driveToReady(ctx);
    const openP = ctx.adapter.openConversation('kavi', 'conv-main');
    const openCmd = ws.framesOf('command').at(-1)!;
    ws.frame({ kind: 'result', id: openCmd.id, ok: true, data: { messages: [] } });
    await openP;
    ws.frame({
      kind: 'event',
      event: { kind: 'message.bot.amend', botId: 'kavi', msgId: 'fx-bot-9', patch: { interrupted: true } },
    });
    expect(ctx.events.find((e) => e.kind === 'message.bot.amend')).toMatchObject({
      kind: 'message.bot.amend',
      msgId: 'fx-bot-9',
      patch: { interrupted: true },
      conversationId: 'conv-main',
    });
  });

  it('D4 follow-up: malformed amends (no id, non-true patch) are ignored', async () => {
    const ctx = makeAdapter();
    const ws = await driveToReady(ctx);
    const wire = (event: Record<string, unknown>) => ws.frame({ kind: 'event', event });
    wire({ kind: 'message.bot.amend', botId: 'kavi', patch: { interrupted: true } });
    wire({ kind: 'message.bot.amend', botId: 'kavi', msgId: 'fx-bot-9', patch: { interrupted: false } });
    wire({ kind: 'message.bot.amend', botId: 'kavi', msgId: 'fx-bot-9' });
    wire({ kind: 'message.bot.amend', botId: 'kavi', msgId: 42, patch: { interrupted: true } });
    expect(ctx.events.filter((e) => e.kind === 'message.bot.amend')).toHaveLength(0);
  });

  it('auto-reconnects after a close while connect intent stands', async () => {
    const ctx = makeAdapter();
    const ws = await driveToReady(ctx);
    ws.close();
    expect(ctx.sockets).toHaveLength(1);
    ctx.scheduler.advance(2100);
    expect(ctx.sockets).toHaveLength(2);
  });
});
