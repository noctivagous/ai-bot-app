// MockAdapter — DESIGN.md §8.3. An in-process, fully scripted implementation
// of the §5 interface. It simulates the same §6.2 checks the real Muse
// extension will run, so the status UI, derivation rules and tests built
// against it stay true for the real adapter.
//
// Determinism is a design rule (§8.3): all timers go through an injected
// scheduler (real in the app, fake in tests) and no Math.random is used in
// status paths — scenario behaviour is reproducible from config alone.

import { derivePhase, type ChannelState } from './derivePhase';
import {
  AdapterCommandError,
  type AdapterCapabilities,
  type AdapterCheck,
  type AdapterConfig,
  type AdapterMeta,
  type AdapterStatus,
  type BotEvent,
  type BotServiceAdapter,
  type BotSummary,
  type ChatMsg,
  type SurfaceAction,
  type Unsubscribe,
} from './types';
import { SEED_MESSAGES } from '../app/seed';

export type MockScenario =
  | 'happy'
  | 'slow'
  | 'degraded'
  | 'notLoggedIn'
  | 'composerMissing'
  | 'disconnectAfterReady'
  | 'flaky';

export const MOCK_SCENARIOS: MockScenario[] = [
  'happy',
  'slow',
  'degraded',
  'notLoggedIn',
  'composerMissing',
  'disconnectAfterReady',
  'flaky',
];

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  now(): number;
}

export const realScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  now: () => Date.now(),
};

export interface MockAdapterOptions {
  scenario?: MockScenario;
  scheduler?: Scheduler;
  /** Base delay between connect-script steps (default 300 ms). */
  stepDelayMs?: number;
}

/** Events the mock emits carry the conversation they belong to (routing
 * sugar for the one-bot/many-conversations shape of §2.11; the §5 union
 * itself routes by botId). */
export type RoutedBotEvent = BotEvent & { conversationId?: string };

interface CheckDef {
  id: string;
  label: string;
  required: boolean;
}

const CHECK_DEFS: CheckDef[] = [
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
];

const ACTION_HINTS: Record<string, string> = {
  auth: 'Open muse.ai and sign in, then Reconnect',
  composer:
    'The composer was not found — the muse.ai page may have changed. Reconnect to retry.',
};

const BOT: BotSummary = {
  id: 'kavi',
  name: 'Kavi',
  code: 'MUSE-01',
  status: 'active',
  desc: 'Your Muse personal agent · muse.ai',
  scheduledCount: 12,
};

interface Job {
  conversationId: string;
  activity: string;
  doneActivity: string;
  totalSec: number;
  progressCap: number;
  completes: boolean;
  elapsedSec: number;
  finished: boolean;
}

/** The scripted multitasking simulation (§2.10): three conversations run in
 * parallel; the AnSci job completes on its own at ~62 s of connected time.
 * Progress is elapsed/total arithmetic — no randomness. */
const JOB_DEFS: Array<Omit<Job, 'elapsedSec' | 'finished'>> = [
  { conversationId: 'conv-nibglider', activity: 'Verifying the layout-fix walk…', doneActivity: 'Finished', totalSec: 170, progressCap: 96, completes: false },
  { conversationId: 'conv-ansci', activity: 'Reviewing CSKG transcript batch…', doneActivity: 'Finished — transcript review ready', totalSec: 62, progressCap: 100, completes: true },
  { conversationId: 'conv-ai-bot-app', activity: 'Building Mission Desk slices 0–1…', doneActivity: 'Finished', totalSec: 300, progressCap: 90, completes: false },
];

export class MockAdapter implements BotServiceAdapter {
  readonly meta: AdapterMeta = { id: 'mock', displayName: 'Muse AI (mock)', version: '0.1.0' };

  private readonly scheduler: Scheduler;
  private readonly stepDelayMs: number;
  private scenario: MockScenario;

  private checks: AdapterCheck[] = [];
  private channel: ChannelState = 'idle';
  private seq = 0;
  private phaseSince = 0;
  private lastPhase: AdapterStatus['phase'] = 'unconfigured';
  private status: AdapterStatus;
  private identity?: { displayName: string };
  private connectCalled = false;
  private disconnectFired = false;

  private statusListeners = new Set<(s: AdapterStatus) => void>();
  private eventListeners = new Set<(e: BotEvent) => void>();
  private timeouts = new Set<unknown>();
  private heartbeatHandle: unknown = null;
  private jobTimer: unknown = null;
  private jobs: Job[] = [];
  private sentClientMsgIds = new Set<string>();
  private counter = 0;
  private currentConversationId = 'conv-main';

  constructor(options: MockAdapterOptions = {}) {
    this.scenario = options.scenario ?? 'happy';
    this.scheduler = options.scheduler ?? realScheduler;
    this.stepDelayMs = options.stepDelayMs ?? 250;
    this.resetChecks();
    this.phaseSince = this.scheduler.now();
    this.status = this.buildStatus();
  }

  // ---- scenario control (dev instrument, §8.3) ----

  getScenario(): MockScenario {
    return this.scenario;
  }

  /** Switch scenario and reconnect so the new script runs. The reset is
   * silent (no 'disconnected' snapshot): a dev reconfiguration of the
   * simulation is not a channel event, and §7.4's system lines are
   * reserved for real transitions. Re-selecting disconnectAfterReady
   * re-arms its one-shot disconnect. */
  async setScenario(scenario: MockScenario): Promise<void> {
    this.scenario = scenario;
    if (scenario === 'disconnectAfterReady') this.disconnectFired = false;
    this.clearTimers();
    this.channel = 'idle';
    this.connectCalled = false;
    await this.connect();
  }

  // ---- BotServiceAdapter ----

  async connect(_config?: AdapterConfig): Promise<void> {
    this.clearTimers();
    this.connectCalled = true;
    this.channel = 'open';
    this.resetChecks();
    this.identity = undefined;
    this.startHeartbeat();
    this.emitStatus(); // snapshot: connecting, all checks pending

    const m = this.scenario === 'slow' ? 5 : 1;
    const step = this.stepDelayMs * m;
    const steps = this.connectSteps();
    // Steps run sequentially: a step that returns false (a failed required
    // check) stops the script — later checks are never probed.
    const runStep = (i: number): void => {
      if (i >= steps.length) return;
      this.after(step, () => {
        const keepGoing = steps[i]!();
        this.emitStatus();
        if (!keepGoing) return;
        if (i === steps.length - 1) {
          this.onConnected();
          return;
        }
        runStep(i + 1);
      });
    };
    runStep(0);
  }

  async disconnect(): Promise<void> {
    this.clearTimers();
    if (this.connectCalled) {
      this.channel = 'closed';
      this.emitStatus();
    }
  }

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

  async listBots(): Promise<BotSummary[]> {
    // §2.11/Q1 settled: one bot — the agent. Conversations live inside it.
    return [{ ...BOT }];
  }

  async openConversation(botId: string, conversationId?: string): Promise<ChatMsg[]> {
    void botId;
    this.currentConversationId = conversationId ?? 'conv-main';
    const msgs = SEED_MESSAGES[this.currentConversationId];
    if (msgs) return msgs.map((m) => ({ ...m }));
    return [
      {
        id: `seed-${this.currentConversationId}`,
        role: 'bot',
        text: 'This conversation is filed in the app’s database. Its earlier history arrives through the adapter in a later slice; the mock seeds a fresh thread here.',
        ts: new Date(this.scheduler.now()).toISOString(),
      },
    ];
  }

  async sendMessage(botId: string, text: string, clientMsgId: string): Promise<void> {
    const phase = this.status.phase;
    if (phase !== 'ready' && phase !== 'degraded') {
      throw new AdapterCommandError(
        'not-ready',
        phase,
        `Cannot send while the adapter is ${phase}. ${this.status.error?.actionHint ?? 'Reconnect and wait for the checks to pass.'}`,
      );
    }
    if (this.sentClientMsgIds.has(clientMsgId)) return; // idempotent (§5.1)
    this.sentClientMsgIds.add(clientMsgId);

    const conversationId = this.currentConversationId;
    const userMsg: ChatMsg = {
      id: `u-${clientMsgId}`,
      role: 'user',
      text,
      ts: new Date(this.scheduler.now()).toISOString(),
    };
    this.emitEvent({ kind: 'message.user', botId, msg: userMsg }, conversationId);

    // Slice-2 placeholder behaviour (§8.3): the prototype's canned reply,
    // delivered through the real event path as delta chunks + final so the
    // streaming contract is exercised end to end. Real conversation content
    // replaces this in slice 2/5 — do not mistake it for a conversation.
    const reply =
      `Mock reply — I received “${text.length > 60 ? `${text.slice(0, 60)}…` : text}”. ` +
      'This is MockAdapter’s canned streaming reply (slice-2 placeholder); in this slice it only proves the event path.';
    const msgId = `mock-reply-${++this.counter}`;
    const chunks = chunkText(reply, 5);
    chunks.forEach((chunk, i) => {
      this.after(140 * (i + 1), () => {
        this.emitEvent({ kind: 'message.bot.delta', botId, msgId, text: chunk }, conversationId);
      });
    });
    this.after(140 * (chunks.length + 1), () => {
      const finalMsg: ChatMsg = {
        id: msgId,
        role: 'bot',
        text: reply,
        ts: new Date(this.scheduler.now()).toISOString(),
      };
      this.emitEvent({ kind: 'message.bot.final', botId, msg: finalMsg }, conversationId);
    });
  }

  async invokeAction(botId: string, action: SurfaceAction): Promise<void> {
    const phase = this.status.phase;
    if (phase !== 'ready' && phase !== 'degraded') {
      throw new AdapterCommandError('not-ready', phase, `Cannot run actions while the adapter is ${phase}.`);
    }
    this.after(60, () => {
      this.emitEvent(
        { kind: 'action.ack', botId, actionId: action.id, ok: true, detail: 'MockAdapter acknowledged the action (simulated).' },
        this.currentConversationId,
      );
    });
  }

  async resolveApproval(_botId: string, _approvalId: string, _decision: 'allow' | 'deny'): Promise<void> {
    // §8.3: mock approvals are simulated in the messages slice, not the
    // status slice. The app records approval decisions itself in this slice.
    throw new AdapterCommandError(
      'unsupported',
      this.status.phase,
      'MockAdapter does not resolve approvals in the status slice.',
    );
  }

  // ---- connect script (§8.3) ----

  /** Each step mutates checks and returns whether the script continues. */
  private connectSteps(): Array<() => boolean> {
    const set = (id: string, state: AdapterCheck['state'], detail?: string) => {
      const c = this.checks.find((x) => x.id === id);
      if (c) {
        c.state = state;
        c.detail = detail;
        c.at = this.scheduler.now();
      }
    };
    const scenario = this.scenario;
    return [
      () => { set('bridge', 'pass'); return true; },
      () => { set('extension', 'pass'); return true; },
      () => { set('tab', 'pass'); return true; },
      () => {
        set('page', 'pass');
        if (scenario === 'notLoggedIn') {
          set('auth', 'fail', 'Not signed in');
          return false; // the script stops at a failed required check
        }
        set('auth', 'pass');
        return true;
      },
      () => {
        if (scenario === 'composerMissing') {
          set('composer', 'fail', 'Composer not found');
          return false;
        }
        set('composer', 'pass');
        set('messageList', 'pass');
        return true;
      },
      // flaky: the observer's first arm attempt fails; the adapter retries
      // inside connect() and never emits a snapshot with observer 'fail',
      // so the phase stays 'connecting' — the retry is visible in the
      // check's detail (and therefore in the status log).
      ...(scenario === 'flaky'
        ? [
            () => {
              set('observer', 'pending', 'Arm attempt failed — retrying');
              set('approvals', 'pass');
              set('activity', 'pass');
              return true;
            },
          ]
        : []),
      () => {
        set('observer', 'pass');
        if (scenario === 'degraded') {
          set('approvals', 'warn', 'Approval observer unavailable');
          set('activity', 'warn', 'Activity observer unavailable');
        } else {
          set('approvals', 'pass');
          set('activity', 'pass');
        }
        return true;
      },
    ];
  }

  private onConnected(): void {
    this.identity = { displayName: 'Kavi (mock)' };
    this.emitStatus();
    if (this.status.phase === 'ready' || this.status.phase === 'degraded') {
      this.startSimulation();
    }
    if (this.scenario === 'disconnectAfterReady' && !this.disconnectFired) {
      this.disconnectFired = true; // one-shot: a Reconnect stays up
      this.after(10_000, () => {
        this.channel = 'closed';
        this.stopHeartbeat();
        this.emitStatus();
      });
    }
  }

  // ---- multitasking simulation (§2.10), driven by activity events ----

  private startSimulation(): void {
    this.jobs = JOB_DEFS.map((j) => ({ ...j, elapsedSec: 0, finished: false }));
    if (this.jobTimer !== null) this.scheduler.clearInterval(this.jobTimer);
    this.jobTimer = this.scheduler.setInterval(() => this.tickJobs(), 2000);
    this.tickJobs();
  }

  private tickJobs(): void {
    if (this.status.phase !== 'ready' && this.status.phase !== 'degraded') return;
    for (const job of this.jobs) {
      if (job.finished) continue;
      job.elapsedSec += 2;
      const done = job.completes && job.elapsedSec >= job.totalSec;
      const progress = done ? 100 : Math.min(job.progressCap, Math.round((job.elapsedSec / job.totalSec) * 100));
      if (done) job.finished = true;
      this.emitEvent(
        {
          kind: 'activity',
          botId: BOT.id,
          widgetId: job.conversationId,
          transient: true,
          patch: {
            conversationId: job.conversationId,
            state: done ? 'done' : 'running',
            activity: done ? job.doneActivity : job.activity,
            progress,
            elapsedSec: job.elapsedSec,
          },
        },
        job.conversationId,
      );
    }
    // Non-completing jobs keep ticking past their cap: the board shows
    // their elapsed time, so the timer runs for the whole session.
  }

  // ---- status plumbing ----

  private resetChecks(): void {
    const now = this.scheduler.now();
    this.checks = CHECK_DEFS.map((d) => ({ ...d, state: 'pending' as const, at: now }));
  }

  private capabilities(): AdapterCapabilities {
    const stateOf = (id: string) => this.checks.find((c) => c.id === id)?.state;
    return {
      streaming: true,
      listBots: true,
      approvals: stateOf('approvals') === 'pass',
      activity: stateOf('activity') === 'pass',
      surfaceActions: true,
      scheduleIntents: true,
      webviewIntents: true,
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
      lastEventAt: this.scheduler.now(),
      detail: this.detailFor(phase, failed?.id),
      checks: this.checks.map((c) => ({ ...c })),
      identity: this.identity,
      currentBotId: this.connectCalled ? BOT.id : undefined,
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
        return 'Connecting to Muse (simulated) — running the shared checks…';
      case 'ready':
        return 'Connected to Muse (simulated). All checks pass.';
      case 'degraded':
        return 'Connected, but the approvals and activity observers are unavailable.';
      case 'disconnected':
        return 'The connection to Muse was lost (simulated). Reconnect to restore it.';
      case 'error':
        return failedCheckId === 'auth'
          ? 'Not signed in to muse.ai (simulated).'
          : 'A required check failed (simulated).';
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

  private emitEvent(e: BotEvent, conversationId?: string): void {
    const routed = conversationId ? ({ ...e, conversationId } as RoutedBotEvent) : e;
    for (const fn of [...this.eventListeners]) fn(routed);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatHandle = this.scheduler.setInterval(() => this.emitStatus(), 5000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatHandle !== null) {
      this.scheduler.clearInterval(this.heartbeatHandle);
      this.heartbeatHandle = null;
    }
  }

  private after(ms: number, fn: () => void): void {
    const handle = this.scheduler.setTimeout(() => {
      this.timeouts.delete(handle);
      fn();
    }, ms);
    this.timeouts.add(handle);
  }

  private clearTimers(): void {
    for (const h of this.timeouts) this.scheduler.clearTimeout(h);
    this.timeouts.clear();
    this.stopHeartbeat();
    if (this.jobTimer !== null) {
      this.scheduler.clearInterval(this.jobTimer);
      this.jobTimer = null;
    }
  }
}

function chunkText(text: string, parts: number): string[] {
  const size = Math.ceil(text.length / parts);
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}
