// MockAdapter — DESIGN.md §8.3. An in-process, fully scripted implementation
// of the §5 interface. It simulates the same §6.2 checks the real Muse
// extension will run, so the status UI, derivation rules and tests built
// against it stay true for the real adapter.
//
// Determinism is a design rule (§8.3): all timers go through an injected
// scheduler (real in the app, fake in tests) and no Math.random is used in
// status paths — scenario behaviour is reproducible from config alone.

import { derivePhase, type ChannelState } from './derivePhase';
import { parseIntents } from './intents';
import {
  AdapterCommandError,
  type AdapterCapabilities,
  type AdapterCheck,
  type AdapterConfig,
  type AdapterMeta,
  type AdapterStatus,
  type ApprovalRequest,
  type BotEvent,
  type BotServiceAdapter,
  type BotSummary,
  type ChatMsg,
  type SurfaceAction,
  type Unsubscribe,
} from './types';
import { SEED_APPROVAL, SEED_MESSAGES } from '../app/seed';

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
  title: string;
  activity: string;
  doneActivity: string;
  /** Evolving "what is it doing" lines (Activity-detail shape, §2.10). */
  detailSteps: string[];
  outcome?: string;
  totalSec: number;
  progressCap: number;
  completes: boolean;
  elapsedSec: number;
  finished: boolean;
}

/** The scripted multitasking simulation (§2.10): three conversations run in
 * parallel; the AnSci job completes on its own at ~62 s of connected time.
 * Progress is elapsed/total arithmetic — no randomness. Detail lines step
 * every ~15 s of job time, mirroring how Muse's Activity detail view
 * changes as work progresses. */
const JOB_DEFS: Array<Omit<Job, 'elapsedSec' | 'finished'>> = [
  {
    conversationId: 'conv-nibglider',
    title: 'NibGlider layout fix',
    activity: 'Verifying the layout-fix walk…',
    doneActivity: 'Finished',
    detailSteps: [
      'Walking tutorial step 12 of 143 — panel sections opening on cue.',
      'Checking that off-screen targets scroll into view before the bubble docks.',
      'Verifying bubble clamping at 1366×768 and 1600×1000.',
      'Re-probing the Snapping card, which measured short in one full-walk run.',
    ],
    totalSec: 170,
    progressCap: 96,
    completes: false,
  },
  {
    conversationId: 'conv-ansci',
    title: 'AnSci CSKG chat',
    activity: 'Reviewing CSKG transcript batch…',
    doneActivity: 'Finished — transcript review ready',
    detailSteps: [
      'Reading transcript batch 4, turn by turn.',
      'Checking each grounded claim against CSKG testimony (Water/Yin edges).',
      'Flagging sense-selection misses for the engine notes.',
      'Composing the review summary for the owner.',
    ],
    outcome: 'Transcript review ready — Chicago set: 26 grounded / 0 ungrounded / 2 declined.',
    totalSec: 62,
    progressCap: 100,
    completes: true,
  },
  {
    conversationId: 'conv-ai-bot-app',
    title: 'Build Muse dashboard app',
    activity: 'Building Mission Desk slices 0–1…',
    doneActivity: 'Finished',
    detailSteps: [
      'Scaffolding the repo: Vite + React + TS, pinned versions.',
      'Writing derivePhase and its derivation-table tests.',
      'Building the Mission Desk shell over the MockAdapter.',
      'Running the driven headless-browser probe.',
    ],
    totalSec: 300,
    progressCap: 90,
    completes: false,
  },
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
  private pendingApprovals = new Map<
    string,
    { approval: ApprovalRequest; conversationId: string; resolved: boolean }
  >();
  private approvalEmitted = new Set<string>();

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

    // The mock's scripted reply (§11 slice 2: the prototype's fake behaviours
    // arrive via BotEvent — this is that behaviour, behind the adapter).
    // Delivered as delta chunks + final so the streaming contract is
    // exercised end to end. It is a simulation of a reply, labelled as such
    // in the text itself — the real adapter's replies arrive in slice 5.
    //
    // Slice 7: "propose a session" gets the intent-carrying scripted
    // reply (same payload shape as the fixture bot's). The intent blocks
    // are parsed out by the shared parser: deltas carry the CLEAN text
    // only, and the intents are emitted as their own events right after
    // the final — exactly the real adapter's behaviour (§10).
    const rawReply = /propose a session/i.test(text)
      ? [
          'Here is a proposed session, plus the map artifact it belongs with.',
          '',
          '```intent',
          '{"type":"schedule","title":"Planning session (from chat)","day":2,"project":"Chinese Book"}',
          '```',
          '',
          '```intent',
          '{"type":"webview","title":"Chinese map + timeline outline","ref":"art-chinese-map"}',
          '```',
        ].join('\n')
      : `Mock reply — I received “${text.length > 60 ? `${text.slice(0, 60)}…` : text}”. ` +
        'This is MockAdapter’s scripted streaming reply; the real conversation arrives through the Muse adapter.';
    const parsed = parseIntents(rawReply);
    const reply = parsed.cleanText;
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
      for (const intent of parsed.schedule) {
        this.emitEvent({ kind: 'intent.schedule', botId, intent }, conversationId);
      }
      for (const wv of parsed.webview) {
        this.emitEvent({ kind: 'intent.webview', botId, url: wv.ref, title: wv.title }, conversationId);
      }
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
    // Slice 7 scripted effect: "Run layout review" produces an activity
    // burst on the NibGlider conversation — a short patch sequence in
    // the standard ActivityPatch shape, ending done with an outcome
    // (which the app surfaces in Recently Finished). The conversation's
    // own job simulation keeps ticking underneath; the burst is a guest
    // activity on the same conversation, as a real control-panel action
    // would be.
    if (action.id === 'layout-review') {
      const conv = 'conv-nibglider';
      const steps = [
        { at: 300, progress: 25, detail: 'Layout review: snapshotting the tutorial walk geometry.' },
        { at: 900, progress: 55, detail: 'Layout review: checking panel sections and bubble clamping.' },
        { at: 1500, progress: 80, detail: 'Layout review: verifying off-screen target scrolling.' },
      ];
      for (const s of steps) {
        this.after(s.at, () => {
          this.emitEvent(
            {
              kind: 'activity',
              botId,
              widgetId: conv,
              transient: true,
              patch: {
                conversationId: conv,
                activityId: 'burst-layout-review',
                title: 'Layout review (control panel)',
                state: 'running',
                activity: 'Running layout review…',
                detail: s.detail,
                progress: s.progress,
                elapsedSec: Math.round(s.at / 1000),
              },
            },
            conv,
          );
        });
      }
      this.after(2200, () => {
        this.emitEvent(
          {
            kind: 'activity',
            botId,
            widgetId: conv,
            transient: true,
            patch: {
              conversationId: conv,
              activityId: 'burst-layout-review',
              title: 'Layout review (control panel)',
              state: 'done',
              activity: 'Layout review complete',
              detail: 'Layout review: all checks walked.',
              outcome: 'Layout review complete — 0 blocking issues, 2 nits noted.',
              progress: 100,
              elapsedSec: 2,
            },
          },
          conv,
        );
      });
    }
  }

  /** Slice 2: the mock raises one scripted approval (see emitScriptedApproval)
   * and resolves it here. The outcome is an event — a `message.system` line
   * routed to the approval's conversation — never the promise's return
   * value (§5.1: a resolved promise means accepted; for an approval the
   * resolution itself is the side-effect, and the chat learns of it as a
   * system line). */
  async resolveApproval(
    botId: string,
    approvalId: string,
    decision: 'allow' | 'deny',
    scope?: 'once' | 'always',
  ): Promise<void> {
    const phase = this.status.phase;
    if (phase !== 'ready' && phase !== 'degraded') {
      throw new AdapterCommandError('not-ready', phase, `Cannot resolve approvals while the adapter is ${phase}.`);
    }
    if (!this.capabilities().approvals) {
      // Degraded: the approvals observer is down (§6.2 optional check), so
      // this adapter genuinely cannot resolve — the app falls back to
      // recording the decision itself.
      throw new AdapterCommandError('unsupported', phase, 'The approvals observer is unavailable in this scenario.');
    }
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending || pending.resolved) {
      throw new AdapterCommandError('gone', phase, `Approval ${approvalId} is not pending.`);
    }
    pending.resolved = true;
    const scopeNote = decision === 'allow' && scope ? ` — ${scope}` : '';
    this.after(40, () => {
      this.emitEvent(
        {
          kind: 'message.system',
          botId,
          text: `Approval ${decision === 'allow' ? 'allowed' : 'denied'}${scopeNote}: ${pending.approval.title}`,
          ts: new Date(this.scheduler.now()).toISOString(),
        },
        pending.conversationId,
      );
    });
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
      this.emitEvent({ kind: 'bots.changed', bots: [{ ...BOT }] }, undefined);
      this.emitScriptedApproval();
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

  /** Slice 2: the scripted approval (§2.7 item 3 — approvals surface at bot
   * level, whichever conversation raised them). Emitted once per adapter
   * lifetime, shortly after connect, and only when the approvals observer
   * is up: in the degraded scenario the capability is lost and no approval
   * can arrive — that loss is the scenario's point. */
  private emitScriptedApproval(): void {
    if (!this.capabilities().approvals) return;
    if (this.approvalEmitted.has(SEED_APPROVAL.id)) return;
    this.approvalEmitted.add(SEED_APPROVAL.id);
    this.after(800, () => {
      if (this.status.phase !== 'ready' && this.status.phase !== 'degraded') return;
      const approval: ApprovalRequest = {
        id: SEED_APPROVAL.id,
        botId: BOT.id,
        title: SEED_APPROVAL.title,
        detail: SEED_APPROVAL.detail,
        // §2.12: Muse's page offers scopes; the mock offers the same so
        // the UI path is identical across adapters.
        scopes: ['once', 'always'],
      };
      this.pendingApprovals.set(approval.id, {
        approval,
        conversationId: SEED_APPROVAL.conversationId,
        resolved: false,
      });
      this.emitEvent({ kind: 'approval.request', botId: BOT.id, approval }, SEED_APPROVAL.conversationId);
    });
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
      const detailIdx = Math.min(
        job.detailSteps.length - 1,
        Math.floor(job.elapsedSec / 15),
      );
      this.emitEvent(
        {
          kind: 'activity',
          botId: BOT.id,
          widgetId: job.conversationId,
          transient: true,
          patch: {
            conversationId: job.conversationId,
            activityId: job.conversationId,
            title: job.title,
            state: done ? 'done' : 'running',
            activity: done ? job.doneActivity : job.activity,
            detail: job.detailSteps[detailIdx],
            outcome: done ? job.outcome : undefined,
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
