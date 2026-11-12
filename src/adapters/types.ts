// Adapter contracts — DESIGN.md §5 (commands/events/capabilities) and §6
// (status model). This file is the contract only; no adapter code lives here.

export interface AdapterMeta {
  id: string;
  displayName: string;
  version: string;
}

export interface AdapterConfig {
  [key: string]: unknown;
}

export type Unsubscribe = () => void;

export type BotPresence = 'active' | 'idle' | 'error';

export interface BotSummary {
  id: string;
  name: string;
  code: string;
  status: BotPresence;
  desc: string;
  scheduledCount: number;
}

export interface ChatMsg {
  id: string;
  role: 'user' | 'bot' | 'system';
  text: string;
  ts: string; // ISO timestamp
}

export interface SurfaceAction {
  id: string;
  label: string;
  payload?: unknown;
}

export interface ApprovalRequest {
  id: string;
  botId: string;
  title: string;
  detail?: string;
}

export interface ScheduleIntent {
  title: string;
  when?: string;
  projectId?: string;
}

export type BotEvent =
  | { kind: 'message.user'; botId: string; msg: ChatMsg }
  | { kind: 'message.bot.delta'; botId: string; msgId: string; text: string }
  | { kind: 'message.bot.final'; botId: string; msg: ChatMsg }
  | { kind: 'message.system'; botId: string; text: string; ts: string }
  | { kind: 'activity'; botId: string; widgetId: string; patch: unknown; transient: true }
  | { kind: 'action.ack'; botId: string; actionId: string; ok: boolean; detail?: string }
  | { kind: 'approval.request'; botId: string; approval: ApprovalRequest }
  | { kind: 'intent.schedule'; botId: string; intent: ScheduleIntent }
  | { kind: 'intent.webview'; botId: string; url: string; title?: string }
  | { kind: 'bots.changed'; bots: BotSummary[] };

export interface AdapterCapabilities {
  streaming: boolean;
  listBots: boolean;
  approvals: boolean;
  activity: boolean;
  surfaceActions: boolean;
  scheduleIntents: boolean;
  webviewIntents: boolean;
}

// ---- Status model (DESIGN.md §6) ----

export type AdapterPhase =
  | 'unconfigured'
  | 'connecting'
  | 'ready'
  | 'degraded'
  | 'disconnected'
  | 'error';

export type CheckState = 'pending' | 'pass' | 'warn' | 'fail' | 'skip';

export interface AdapterCheck {
  id: string;
  label: string;
  required: boolean;
  state: CheckState;
  detail?: string;
  at?: number;
}

export interface AdapterStatusError {
  code: string;
  message: string;
  recoverable: boolean;
  actionHint?: string;
}

export interface AdapterStatus {
  adapterId: string;
  adapterVersion: string;
  seq: number;
  phase: AdapterPhase;
  since: number;
  lastEventAt?: number;
  detail: string;
  checks: AdapterCheck[];
  identity?: { displayName: string };
  currentBotId?: string;
  capabilities: AdapterCapabilities;
  error?: AdapterStatusError;
}

export type AdapterCommandErrorCode = 'not-ready' | 'unsupported' | 'gone';

/** Typed command rejection (DESIGN.md §5.1) — never a silent no-op. */
export class AdapterCommandError extends Error {
  readonly code: AdapterCommandErrorCode;
  readonly phase: AdapterPhase;

  constructor(code: AdapterCommandErrorCode, phase: AdapterPhase, message: string) {
    super(message);
    this.name = 'AdapterCommandError';
    this.code = code;
    this.phase = phase;
  }
}

export interface BotServiceAdapter {
  readonly meta: AdapterMeta;
  connect(config?: AdapterConfig): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): AdapterStatus;
  onStatus(fn: (s: AdapterStatus) => void): Unsubscribe;
  onEvent(fn: (e: BotEvent) => void): Unsubscribe;

  listBots(): Promise<BotSummary[]>;
  // DESIGN.md §5 sketches openConversation(botId). Since §2.11 settled Q1
  // (one bot, many conversations), the mock also accepts the conversation to
  // open; the botId-only call shape remains valid.
  openConversation(botId: string, conversationId?: string): Promise<ChatMsg[]>;
  sendMessage(botId: string, text: string, clientMsgId: string): Promise<void>;
  invokeAction(botId: string, action: SurfaceAction): Promise<void>;
  resolveApproval(botId: string, approvalId: string, decision: 'allow' | 'deny'): Promise<void>;
}
