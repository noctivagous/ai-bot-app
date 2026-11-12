import { describe, expect, it } from 'vitest';
import { MockAdapter, type MockScenario } from './MockAdapter';
import { FakeScheduler } from './FakeScheduler';
import { AdapterCommandError, type AdapterStatus, type BotEvent } from './types';

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

  it('slice 7: "propose a session" streams CLEAN text only and emits both intents after the final', async () => {
    const { adapter, scheduler, events } = makeAdapter('happy');
    void adapter.connect();
    scheduler.advance(1000);
    await adapter.openConversation('kavi', 'conv-main');
    await adapter.sendMessage('kavi', 'propose a session', 'm-intent');
    scheduler.advance(3000);
    const deltas = events.filter((e) => e.kind === 'message.bot.delta');
    const deltaText = deltas.map((d) => (d.kind === 'message.bot.delta' ? d.text : '')).join('');
    expect(deltaText).not.toContain('intent');
    expect(deltaText).toContain('proposed session');
    const finals = events.filter((e) => e.kind === 'message.bot.final');
    expect(finals).toHaveLength(1);
    expect(finals[0]!.kind === 'message.bot.final' && finals[0].msg.text).toBe(deltaText);
    const sched = events.filter((e) => e.kind === 'intent.schedule');
    expect(sched).toHaveLength(1);
    expect(sched[0]).toMatchObject({
      kind: 'intent.schedule',
      intent: { title: 'Planning session (from chat)', day: 2, projectName: 'Chinese Book' },
    });
    const wv = events.filter((e) => e.kind === 'intent.webview');
    expect(wv).toHaveLength(1);
    expect(wv[0]).toMatchObject({ kind: 'intent.webview', url: 'art-chinese-map' });
    // intents come after the final in the event order
    const order = events.map((e) => e.kind);
    expect(order.indexOf('intent.schedule')).toBeGreaterThan(order.indexOf('message.bot.final'));
  });

  it('slice 7: invokeAction layout-review bursts activity on conv-nibglider, ending done with an outcome', async () => {
    const { adapter, scheduler, events } = makeAdapter('happy');
    void adapter.connect();
    scheduler.advance(1000);
    await adapter.invokeAction('kavi', { id: 'layout-review', label: 'Run layout review' });
    scheduler.advance(3000);
    const burst = events
      .filter((e) => e.kind === 'activity')
      .map((e) => (e.kind === 'activity' ? (e.patch as Record<string, unknown>) : {}))
      .filter((p) => p.activityId === 'burst-layout-review');
    expect(burst.length).toBeGreaterThanOrEqual(3);
    expect(burst.some((p) => p.state === 'running')).toBe(true);
    const done = burst.find((p) => p.state === 'done');
    expect(done).toBeDefined();
    expect(String(done!.outcome)).toContain('Layout review complete');
    expect(done!.conversationId).toBe('conv-nibglider');
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

  it('invokeAction gates on phase and emits action.ack when ready', async () => {
    const { adapter, scheduler, events } = makeAdapter('happy');
    void adapter.connect();
    await expect(adapter.invokeAction('kavi', { id: 'act-1', label: 'Review' })).rejects.toMatchObject({
      code: 'not-ready',
    });
    scheduler.advance(1000);
    await adapter.invokeAction('kavi', { id: 'act-1', label: 'Review' });
    scheduler.advance(200);
    const acks = events.filter((e) => e.kind === 'action.ack');
    expect(acks).toHaveLength(1);
    expect(acks[0]).toMatchObject({ kind: 'action.ack', actionId: 'act-1', ok: true });
  });

  it('send event sequence is user → deltas → exactly one final, in order', async () => {
    const { adapter, scheduler, events } = makeAdapter('happy');
    void adapter.connect();
    scheduler.advance(1000);
    await adapter.sendMessage('kavi', 'sequence check', 'seq-1');
    scheduler.advance(3000);
    const kinds = events
      .filter((e) => e.kind.startsWith('message.'))
      .map((e) => e.kind);
    expect(kinds[0]).toBe('message.user');
    expect(kinds.at(-1)).toBe('message.bot.final');
    expect(kinds.filter((k) => k === 'message.bot.final')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'message.bot.delta').length).toBeGreaterThanOrEqual(3);
    expect(kinds.indexOf('message.bot.final')).toBeGreaterThan(kinds.lastIndexOf('message.bot.delta'));
  });
});

describe('MockAdapter approvals + bots.changed (slice 2)', () => {
  it('emits bots.changed once after connect, with the one agent', async () => {
    const { adapter, scheduler, events } = makeAdapter('happy');
    void adapter.connect();
    scheduler.advance(1000);
    const changed = events.filter((e) => e.kind === 'bots.changed');
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ kind: 'bots.changed' });
    if (changed[0]!.kind === 'bots.changed') {
      expect(changed[0].bots).toHaveLength(1);
      expect(changed[0].bots[0]!.id).toBe('kavi');
    }
  });

  it('raises the scripted approval as approval.request after ready', async () => {
    const { adapter, scheduler, events } = makeAdapter('happy');
    void adapter.connect();
    scheduler.advance(1000); // ready (~600 ms) but approval lands at +800 ms after
    scheduler.advance(1000);
    const reqs = events.filter((e) => e.kind === 'approval.request');
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({
      kind: 'approval.request',
      approval: { id: 'approval-nibglider-push', title: 'Push NibGlider layout fix to main?' },
    });
    // §2.12: the mock offers the same scopes Muse's page offers
    if (reqs[0]!.kind === 'approval.request') {
      expect(reqs[0].approval.scopes).toEqual(['once', 'always']);
    }
  });

  it('resolveApproval with scope always: the outcome line names the scope', async () => {
    const { adapter, scheduler, events } = makeAdapter('happy');
    void adapter.connect();
    scheduler.advance(2000);
    await adapter.resolveApproval('kavi', 'approval-nibglider-push', 'allow', 'always');
    scheduler.advance(200);
    const systems = events.filter((e) => e.kind === 'message.system');
    expect(systems).toHaveLength(1);
    if (systems[0]!.kind === 'message.system') {
      expect(systems[0].text).toContain('Approval allowed — always');
    }
  });

  it('degraded: the approvals observer is down, so no approval is raised', async () => {
    const { adapter, scheduler, events } = makeAdapter('degraded');
    void adapter.connect();
    scheduler.advance(3000);
    expect(events.filter((e) => e.kind === 'approval.request')).toHaveLength(0);
  });

  it('resolveApproval allow: resolves, outcome arrives as a message.system event', async () => {
    const { adapter, scheduler, events } = makeAdapter('happy');
    void adapter.connect();
    scheduler.advance(2000); // approval pending
    await adapter.resolveApproval('kavi', 'approval-nibglider-push', 'allow');
    scheduler.advance(200);
    const systems = events.filter((e) => e.kind === 'message.system');
    expect(systems).toHaveLength(1);
    expect(systems[0]).toMatchObject({ kind: 'message.system' });
    if (systems[0]!.kind === 'message.system') {
      expect(systems[0].text).toContain('Approval allowed');
      expect(systems[0].text).toContain('Push NibGlider layout fix');
    }
    // a second resolution of the same approval is 'gone', not a no-op
    await expect(adapter.resolveApproval('kavi', 'approval-nibglider-push', 'allow')).rejects.toMatchObject({
      code: 'gone',
    });
  });

  it('resolveApproval deny: the system line says denied; unknown id is gone', async () => {
    const { adapter, scheduler, events } = makeAdapter('happy');
    void adapter.connect();
    scheduler.advance(2000);
    await expect(adapter.resolveApproval('kavi', 'approval-nope', 'deny')).rejects.toMatchObject({
      code: 'gone',
    });
    await adapter.resolveApproval('kavi', 'approval-nibglider-push', 'deny');
    scheduler.advance(200);
    const systems = events.filter((e) => e.kind === 'message.system');
    expect(systems).toHaveLength(1);
    if (systems[0]!.kind === 'message.system') expect(systems[0].text).toContain('Approval denied');
  });

  it('resolveApproval gates: not-ready while connecting, unsupported when the observer is down', async () => {
    const connecting = makeAdapter('happy');
    void connecting.adapter.connect();
    await expect(
      connecting.adapter.resolveApproval('kavi', 'approval-nibglider-push', 'allow'),
    ).rejects.toMatchObject({ code: 'not-ready', phase: 'connecting' });

    const degraded = makeAdapter('degraded');
    void degraded.adapter.connect();
    degraded.scheduler.advance(2000);
    await expect(
      degraded.adapter.resolveApproval('kavi', 'approval-nibglider-push', 'allow'),
    ).rejects.toMatchObject({ code: 'unsupported' });
  });
});

describe('MockAdapter bots + activity lifecycle (slices 1–2)', () => {
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
    // lifecycle: running… → done exactly once (the job is retired after
    // finishing; the app turns that single event into done-unread)
    expect(done).toHaveLength(1);
    const ansciStates = events
      .filter((e) => e.kind === 'activity')
      .map((e) => e.kind === 'activity' ? (e.patch as { conversationId: string; state: string }) : null)
      .filter((p) => p && p.conversationId === 'conv-ansci')
      .map((p) => p!.state);
    expect(ansciStates[0]).toBe('running');
    expect(ansciStates.at(-1)).toBe('done');
    // non-completing jobs never emit done
    const nibDone = events.filter(
      (e) =>
        e.kind === 'activity' &&
        (e.patch as { conversationId: string; state: string }).conversationId === 'conv-nibglider' &&
        (e.patch as { state: string }).state === 'done',
    );
    expect(nibDone).toHaveLength(0);
  });

  it('activity patches carry the ActivityPatch shape: evolving detail, outcome on completion', async () => {
    const { adapter, scheduler, events } = makeAdapter('happy');
    void adapter.connect();
    scheduler.advance(1000); // ready; simulation ticks
    const patches = () =>
      events
        .filter((e) => e.kind === 'activity')
        .map((e) => (e.kind === 'activity' ? (e.patch as Record<string, unknown>) : {}))
        .filter((p) => p.conversationId === 'conv-ansci');
    expect(patches().length).toBeGreaterThan(0);
    const first = patches()[0]!;
    expect(first.activityId).toBe('conv-ansci');
    expect(first.title).toBe('AnSci CSKG chat');
    expect(typeof first.detail).toBe('string');

    scheduler.advance(40_000); // detail steps evolve every ~15 s of job time
    const details = new Set(patches().map((p) => p.detail));
    expect(details.size).toBeGreaterThanOrEqual(2);

    scheduler.advance(40_000); // past the 62 s completion
    const donePatch = patches().find((p) => p.state === 'done')!;
    expect(donePatch).toBeDefined();
    expect(String(donePatch.outcome)).toContain('grounded');
    expect(typeof donePatch.detail).toBe('string');
  });
});
