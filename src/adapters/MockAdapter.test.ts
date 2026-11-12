import { describe, expect, it } from 'vitest';
import { MockAdapter, type MockScenario, type Scheduler } from './MockAdapter';
import { AdapterCommandError, type AdapterStatus, type BotEvent } from './types';

/** Deterministic scheduler: timers fire only when advance() moves the clock. */
class FakeScheduler implements Scheduler {
  private t = 1_000_000;
  private nextId = 1;
  private timers = new Map<number, { fn: () => void; at: number; interval?: number }>();

  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { fn, at: this.t + ms });
    return id;
  }
  clearTimeout(h: unknown): void {
    this.timers.delete(h as number);
  }
  setInterval(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { fn, at: this.t + ms, interval: ms });
    return id;
  }
  clearInterval(h: unknown): void {
    this.timers.delete(h as number);
  }
  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      let next: [number, { fn: () => void; at: number; interval?: number }] | undefined;
      for (const entry of this.timers) {
        if (entry[1].at <= end && (!next || entry[1].at < next[1].at)) next = entry;
      }
      if (!next) break;
      const [id, timer] = next;
      this.t = timer.at;
      if (timer.interval) timer.at = this.t + timer.interval;
      else this.timers.delete(id);
      timer.fn();
    }
    this.t = end;
  }
}

function makeAdapter(scenario: MockScenario = 'happy') {
  const scheduler = new FakeScheduler();
  const adapter = new MockAdapter({ scenario, scheduler, stepDelayMs: 100 });
  const snapshots: AdapterStatus[] = [];
  adapter.onStatus((s) => snapshots.push(s));
  const events: BotEvent[] = [];
  adapter.onEvent((e) => events.push(e));
  return { adapter, scheduler, snapshots, events };
}

describe('MockAdapter connect script (§8.3)', () => {
  it('starts unconfigured before connect()', () => {
    const { adapter } = makeAdapter();
    expect(adapter.getStatus().phase).toBe('unconfigured');
  });

  it('happy: emits a snapshot at every step, checks passing in §8.3 order, ends ready', async () => {
    const { adapter, scheduler, snapshots } = makeAdapter('happy');
    void adapter.connect();
    // first snapshot is synchronous: connecting, everything pending
    expect(snapshots[0]!.phase).toBe('connecting');
    expect(snapshots[0]!.checks.every((c) => c.state === 'pending')).toBe(true);

    scheduler.advance(100); // bridge
    expect(snapshots.at(-1)!.checks.find((c) => c.id === 'bridge')!.state).toBe('pass');
    expect(snapshots.at(-1)!.phase).toBe('connecting');

    scheduler.advance(200); // extension + tab
    expect(snapshots.at(-1)!.checks.find((c) => c.id === 'tab')!.state).toBe('pass');

    scheduler.advance(300); // page+auth, composer+messageList, observer+approvals+activity
    const final = adapter.getStatus();
    expect(final.phase).toBe('ready');
    expect(final.checks.every((c) => c.state === 'pass')).toBe(true);
    expect(final.identity).toEqual({ displayName: 'Kavi (mock)' });
    expect(final.currentBotId).toBe('kavi');
    expect(Object.values(final.capabilities).every(Boolean)).toBe(true);
    // at least one snapshot per script step (6 steps + initial + identity emit)
    expect(snapshots.length).toBeGreaterThanOrEqual(7);
  });

  it('seq is strictly monotonic across snapshots, including heartbeats', async () => {
    const { adapter, scheduler, snapshots } = makeAdapter('happy');
    void adapter.connect();
    scheduler.advance(600); // connect script done
    scheduler.advance(15_000); // three heartbeats
    const seqs = snapshots.map((s) => s.seq);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]!).toBeGreaterThan(seqs[i - 1]!);
    expect(adapter.getStatus().phase).toBe('ready');
  });

  it('slow: delays ×5 — still connecting at 2 s, ready by ~3.5 s, never errors', async () => {
    const { adapter, scheduler, snapshots } = makeAdapter('slow');
    void adapter.connect();
    scheduler.advance(2000);
    expect(adapter.getStatus().phase).toBe('connecting');
    scheduler.advance(2000);
    expect(adapter.getStatus().phase).toBe('ready');
    expect(snapshots.some((s) => s.phase === 'error')).toBe(false);
  });

  it('degraded: approvals+activity warn → degraded phase, those capabilities false', async () => {
    const { adapter, scheduler } = makeAdapter('degraded');
    void adapter.connect();
    scheduler.advance(1000);
    const s = adapter.getStatus();
    expect(s.phase).toBe('degraded');
    expect(s.checks.find((c) => c.id === 'approvals')!.state).toBe('warn');
    expect(s.checks.find((c) => c.id === 'activity')!.state).toBe('warn');
    expect(s.capabilities.approvals).toBe(false);
    expect(s.capabilities.activity).toBe(false);
    expect(s.capabilities.streaming).toBe(true);
  });

  it('notLoggedIn: auth fails → error with the sign-in hint; later checks never probed', async () => {
    const { adapter, scheduler } = makeAdapter('notLoggedIn');
    void adapter.connect();
    scheduler.advance(2000);
    const s = adapter.getStatus();
    expect(s.phase).toBe('error');
    expect(s.checks.find((c) => c.id === 'auth')!.state).toBe('fail');
    expect(s.checks.find((c) => c.id === 'composer')!.state).toBe('pending');
    expect(s.error?.recoverable).toBe(true);
    expect(s.error?.actionHint).toContain('sign in');
  });

  it('composerMissing: composer fails → error with the page-changed hint', async () => {
    const { adapter, scheduler } = makeAdapter('composerMissing');
    void adapter.connect();
    scheduler.advance(2000);
    const s = adapter.getStatus();
    expect(s.phase).toBe('error');
    expect(s.checks.find((c) => c.id === 'composer')!.state).toBe('fail');
    expect(s.error?.actionHint).toContain('may have changed');
  });

  it('disconnectAfterReady: ready, then disconnected at +10 s; heartbeat stops', async () => {
    const { adapter, scheduler, snapshots } = makeAdapter('disconnectAfterReady');
    void adapter.connect();
    scheduler.advance(1000);
    expect(adapter.getStatus().phase).toBe('ready');
    scheduler.advance(10_000);
    expect(adapter.getStatus().phase).toBe('disconnected');
    const countAtClose = snapshots.length;
    scheduler.advance(20_000);
    expect(snapshots.length).toBe(countAtClose); // no further snapshots — lastEventAt frozen
  });

  it('flaky: observer retries inside connect — no error snapshot, ends ready, retry in check detail', async () => {
    const { adapter, scheduler, snapshots } = makeAdapter('flaky');
    void adapter.connect();
    scheduler.advance(3000);
    expect(adapter.getStatus().phase).toBe('ready');
    expect(snapshots.some((s) => s.phase === 'error')).toBe(false);
    const retrySnap = snapshots.find((s) =>
      s.checks.some((c) => c.id === 'observer' && (c.detail ?? '').includes('retrying')),
    );
    expect(retrySnap).toBeDefined();
    expect(retrySnap!.phase).toBe('connecting');
  });
});

describe('MockAdapter commands (§5.1 / §7.3)', () => {
  it('sendMessage rejects not-ready while connecting, with the phase named', async () => {
    const { adapter } = makeAdapter('happy');
    void adapter.connect();
    await expect(adapter.sendMessage('kavi', 'hi', 'm1')).rejects.toMatchObject({
      name: 'AdapterCommandError',
      code: 'not-ready',
      phase: 'connecting',
    });
  });

  it('sendMessage rejects not-ready in error phase', async () => {
    const { adapter, scheduler } = makeAdapter('notLoggedIn');
    void adapter.connect();
    scheduler.advance(2000);
    const err = await adapter.sendMessage('kavi', 'hi', 'm1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterCommandError);
    expect((err as AdapterCommandError).code).toBe('not-ready');
    expect((err as AdapterCommandError).phase).toBe('error');
  });

  it('sendMessage in ready emits user message, delta chunks and a final', async () => {
    const { adapter, scheduler, events } = makeAdapter('happy');
    void adapter.connect();
    scheduler.advance(1000);
    await adapter.openConversation('kavi', 'conv-main');
    await adapter.sendMessage('kavi', 'status please', 'm42');
    expect(events.some((e) => e.kind === 'message.user')).toBe(true);
    scheduler.advance(2000);
    const deltas = events.filter((e) => e.kind === 'message.bot.delta');
    const finals = events.filter((e) => e.kind === 'message.bot.final');
    expect(deltas.length).toBeGreaterThanOrEqual(3);
    expect(finals).toHaveLength(1);
    const finalText = finals[0]!.kind === 'message.bot.final' ? finals[0].msg.text : '';
    const deltaText = deltas.map((d) => (d.kind === 'message.bot.delta' ? d.text : '')).join('');
    expect(deltaText).toBe(finalText);
  });

  it('sendMessage is idempotent per clientMsgId', async () => {
    const { adapter, scheduler, events } = makeAdapter('happy');
    void adapter.connect();
    scheduler.advance(1000);
    await adapter.sendMessage('kavi', 'once', 'dup-1');
    await adapter.sendMessage('kavi', 'once', 'dup-1');
    scheduler.advance(2000);
    expect(events.filter((e) => e.kind === 'message.user')).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'message.bot.final')).toHaveLength(1);
  });

  it('resolveApproval rejects unsupported in this slice', async () => {
    const { adapter, scheduler } = makeAdapter('happy');
    void adapter.connect();
    scheduler.advance(1000);
    await expect(adapter.resolveApproval('kavi', 'a1', 'allow')).rejects.toMatchObject({
      code: 'unsupported',
    });
  });

  it('listBots returns the one agent (§2.11: no bots list in Muse AI Mode)', async () => {
    const { adapter } = makeAdapter();
    const bots = await adapter.listBots();
    expect(bots).toHaveLength(1);
    expect(bots[0]!.id).toBe('kavi');
  });

  it('activity events drive the multitasking simulation; AnSci completes at ~62 s', async () => {
    const { adapter, scheduler, events } = makeAdapter('happy');
    void adapter.connect();
    scheduler.advance(1000); // ready; simulation starts
    scheduler.advance(10_000);
    const activity = events.filter((e) => e.kind === 'activity');
    expect(activity.length).toBeGreaterThan(0);
    const convs = new Set(
      activity.map((e) => (e.kind === 'activity' ? (e.patch as { conversationId: string }).conversationId : '')),
    );
    expect(convs.has('conv-nibglider')).toBe(true);
    expect(convs.has('conv-ansci')).toBe(true);
    expect(convs.has('conv-ai-bot-app')).toBe(true);

    scheduler.advance(60_000);
    const done = events.filter(
      (e) => e.kind === 'activity',
    ).filter(
      (e) =>
        e.kind === 'activity' &&
        (e.patch as { conversationId: string; state: string }).conversationId === 'conv-ansci' &&
        (e.patch as { state: string }).state === 'done',
    );
    expect(done.length).toBeGreaterThanOrEqual(1);
  });
});
