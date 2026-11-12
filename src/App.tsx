import { useCallback, useEffect, useRef, useState } from 'react';
import { TopStrip } from './components/TopStrip';
import { ProjectRail } from './components/ProjectRail';
import { Board, type FinishedItem } from './components/Board';
import { ConversationsTable } from './components/ConversationsTable';
import { ScheduleView } from './components/ScheduleView';
import { ArtifactsView, ArtifactViewer } from './components/ArtifactsView';
import { ChatPanel } from './components/ChatPanel';
import { adapterStore, useAdapter } from './app/useAdapter';
import { loadCollection, records } from './app/records';
import {
  SEED_ARTIFACTS,
  SEED_CONVERSATIONS,
  SEED_MESSAGES,
  SEED_PROJECTS,
  SEED_SCHEDULE,
  type AppEvent,
  type ArtifactItem,
  type ConversationRecord,
  type Project,
  type ScheduleItem,
  type ScheduleProposal,
} from './app/seed';
import { timeAgo, type LiveMap, type RecentFinish, type ToastMsg } from './app/live';
import { CONTROL_ACTIONS } from './app/controlPanel';
import {
  RESOURCE_MODULES,
  isConnected,
  withConnection,
  type ResourceConnection,
} from './app/resources';
import {
  AdapterCommandError,
  type ActivityPatch,
  type AdapterPhase,
  type ApprovalRequest,
  type ChatMsg,
  type SurfaceAction,
} from './adapters/types';
import type { RoutedBotEvent } from './adapters/MockAdapter';

type View = 'board' | 'conversations' | 'schedule' | 'artifacts';

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'board', label: 'Board' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'artifacts', label: 'Artifacts' },
];

const BOT_ID = 'kavi';
const DEFAULT_SYSTEM_LINE_CONV = 'conv-ai-bot-app';

export default function App() {
  const snap = useAdapter();
  const phase: AdapterPhase | null = snap.constructionError
    ? 'unconfigured'
    : (snap.status?.phase ?? null);

  const [view, setView] = useState<View>('board');
  const [scope, setScope] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [projects, setProjects] = useState<Project[]>(SEED_PROJECTS);
  const [conversations, setConversations] = useState<ConversationRecord[]>(SEED_CONVERSATIONS);
  const [schedule, setSchedule] = useState<ScheduleItem[]>(SEED_SCHEDULE);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const hydratedRef = useRef(false);

  const [live, setLive] = useState<LiveMap>({});
  const [finished, setFinished] = useState<FinishedItem[]>([]);
  const [recentlyFinished, setRecentlyFinished] = useState<RecentFinish[]>([]);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  // Pending approvals arrive ONLY as adapter `approval.request` events
  // (slice 2) — the app never seeds one itself.
  const [pendingApprovals, setPendingApprovals] = useState<
    Array<{ approval: ApprovalRequest; conversationId?: string }>
  >([]);
  // Chat-proposed schedule entries (§10, slice 7): arrive ONLY as
  // intent.schedule events; filed into md_schedule only on Accept.
  const [proposals, setProposals] = useState<ScheduleProposal[]>([]);
  // Resource-module connections (§10 second plug-in kind): registry +
  // toggles only in this tranche — no data flows behind them yet.
  const [resourceConns, setResourceConns] = useState<ResourceConnection[]>([]);

  const [chatOpenId, setChatOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, ChatMsg[]>>({});
  const [streaming, setStreaming] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<ArtifactItem | null>(null);

  const toastIdRef = useRef(0);
  const sendCounterRef = useRef(0);
  const loadedConvsRef = useRef<Set<string>>(new Set());
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const proposalsRef = useRef(proposals);
  proposalsRef.current = proposals;
  const chatOpenRef = useRef<string | null>(null);
  chatOpenRef.current = chatOpenId;

  const toast = useCallback((text: string, error = false) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, text, error }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 7000);
  }, []);

  // ---- hydration: stored organisation records win over seeds (§8.1 stub) ----
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [p, c, s, e, pr, rc] = await Promise.all([
        loadCollection('md_projects', SEED_PROJECTS),
        loadCollection('md_conversations', SEED_CONVERSATIONS),
        loadCollection('md_schedule', SEED_SCHEDULE),
        loadCollection<AppEvent>('md_events', []),
        loadCollection<ScheduleProposal>('md_proposals', []),
        loadCollection<ResourceConnection>('md_resources', []),
      ]);
      if (cancelled) return;
      setProjects(p);
      setConversations(c);
      setSchedule(s);
      setEvents(e);
      setProposals(pr);
      setResourceConns(rc);
      hydratedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistConversations = useCallback((next: ConversationRecord[]) => {
    setConversations(next);
    if (hydratedRef.current) void records.save('md_conversations', next);
  }, []);

  const changeConversation = useCallback(
    (updated: ConversationRecord) => {
      persistConversations(conversationsRef.current.map((c) => (c.id === updated.id ? updated : c)));
    },
    [persistConversations],
  );

  const appendMessage = useCallback((convId: string, msg: ChatMsg) => {
    setMessages((prev) => {
      const existing = prev[convId] ?? [];
      // Dedupe by message id (§11 slice 5): a final re-delivered after an
      // app reload or bridge reconnect must not duplicate the message.
      // Adapters dedupe too; this is the store-level guarantee.
      if (existing.some((m) => m.id === msg.id)) return prev;
      return { ...prev, [convId]: [...existing, msg] };
    });
  }, []);

  const sysLineCounterRef = useRef(0);
  const appendSystemLine = useCallback(
    (convId: string, text: string) => {
      appendMessage(convId, {
        id: `sys-${Date.now()}-${++sysLineCounterRef.current}`,
        role: 'system',
        text,
        ts: new Date().toISOString(),
      });
    },
    [appendMessage],
  );

  // ---- adapter events: activity (live state), messages, acks ----
  useEffect(() => {
    return adapterStore.onEvent((raw) => {
      const e = raw as RoutedBotEvent;
      const convId = e.conversationId;
      switch (e.kind) {
        case 'activity': {
          const patch = e.patch as ActivityPatch;
          setLive((prev) => {
            const was = prev[patch.conversationId];
            if (patch.state === 'done' && was?.state !== 'done') {
              const title =
                patch.title ??
                conversationsRef.current.find((c) => c.id === patch.conversationId)?.title ??
                patch.conversationId;
              queueMicrotask(() => {
                toast(`${title} finished — ${patch.activity}`);
                setFinished((f) => [
                  ...f.filter((x) => x.conversationId !== patch.conversationId),
                  { conversationId: patch.conversationId, label: title },
                ]);
                setRecentlyFinished((r) => [
                  {
                    conversationId: patch.conversationId,
                    title,
                    outcome: patch.outcome,
                    detail: patch.detail,
                    at: Date.now(),
                  },
                  ...r.filter((x) => x.conversationId !== patch.conversationId),
                ].slice(0, 6));
              });
            }
            return {
              ...prev,
              [patch.conversationId]: {
                state: patch.state,
                activity: patch.activity,
                detail: patch.detail,
                outcome: patch.outcome,
                title: patch.title,
                progress: patch.progress ?? was?.progress ?? 0,
                elapsedSec: patch.elapsedSec ?? was?.elapsedSec ?? 0,
              },
            };
          });
          break;
        }
        case 'message.user':
          if (convId) appendMessage(convId, e.msg);
          break;
        case 'message.bot.delta':
          if (convId) {
            setStreaming((prev) => ({ ...prev, [convId]: (prev[convId] ?? '') + e.text }));
          }
          break;
        case 'message.bot.final':
          if (convId) {
            appendMessage(convId, e.msg);
            setStreaming((prev) => {
              const next = { ...prev };
              delete next[convId];
              return next;
            });
          }
          break;
        case 'message.system':
          if (convId) appendMessage(convId, { id: `sys-${Date.now()}`, role: 'system', text: e.text, ts: e.ts });
          break;
        case 'action.ack':
          toast(e.detail ?? `Action ${e.actionId} acknowledged`);
          break;
        case 'intent.schedule': {
          // §10 + §2.9: a chat-proposed entry is a PROPOSAL. It lands in
          // md_proposals and reaches md_schedule only if the owner
          // accepts it in the Schedule view — never auto-filed.
          const proposal: ScheduleProposal = {
            id: `prop-${Date.now()}`,
            title: e.intent.title,
            dayOffset: e.intent.day,
            projectId: e.intent.projectId ?? null,
            projectName: e.intent.projectName,
            conversationId: convId,
            ts: Date.now(),
          };
          const next = [...proposalsRef.current, proposal];
          setProposals(next);
          if (hydratedRef.current) void records.save('md_proposals', next);
          toast(`Chat proposed a schedule entry: “${e.intent.title}” — review it in Schedule`);
          break;
        }
        case 'intent.webview': {
          const artifact = SEED_ARTIFACTS.find((a) => a.id === e.url);
          if (artifact) {
            setViewer(artifact);
            toast(`Chat opened “${artifact.name}” in the viewer`);
          } else {
            toast(`Chat referenced an unknown artifact “${e.url}”`, true);
          }
          break;
        }
        case 'approval.request': {
          // An approval the owner already decided (persisted decision in
          // md_events) is not re-raised when an adapter re-emits it after
          // a reload/reconnect.
          const decided = eventsRef.current.some(
            (x) => x.kind === 'approval.decision' && x.refId === e.approval.id,
          );
          if (!decided) {
            setPendingApprovals((prev) =>
              prev.some((p) => p.approval.id === e.approval.id)
                ? prev
                : [...prev, { approval: e.approval, conversationId: convId }],
            );
          }
          break;
        }
        default:
          break;
      }
    });
  }, [appendMessage, toast]);

  // ---- §7.4 system lines: exactly one on entering error / disconnect,
  // exactly one on recovering to ready. Nothing else reaches the chat log.
  // Judged between *stable* phases: 'connecting' is a transient the walk
  // passes through, so recovering error → connecting → ready still counts
  // as one recovery, and the boot walk (→ connecting → ready) counts as
  // none.
  const stablePhaseRef = useRef<AdapterPhase | null>(null);
  const statusRef = useRef(snap.status);
  statusRef.current = snap.status;
  useEffect(() => {
    if (!phase || phase === 'connecting' || phase === 'unconfigured') return;
    const stable = stablePhaseRef.current;
    if (stable === phase) return;
    stablePhaseRef.current = phase;
    if (!stable) return; // first stable phase after boot — no line
    const target = chatOpenRef.current ?? DEFAULT_SYSTEM_LINE_CONV;
    if (phase === 'error') {
      const hint = statusRef.current?.error?.actionHint;
      appendSystemLine(target, `Connection error${hint ? ` — ${hint}` : ''}`);
    } else if (phase === 'disconnected' && (stable === 'ready' || stable === 'degraded')) {
      appendSystemLine(target, 'Connection lost — the adapter disconnected');
    } else if (phase === 'ready' && (stable === 'error' || stable === 'disconnected')) {
      appendSystemLine(target, 'Connection restored — the adapter is ready');
    }
  }, [phase, appendSystemLine]);

  // ---- chat ----

  const openChat = useCallback((convId: string) => {
    setChatOpenId(convId);
    setFinished((f) => f.filter((x) => x.conversationId !== convId));
    setLive((prev) => {
      if (prev[convId]?.state !== 'done') return prev;
      const next = { ...prev };
      delete next[convId];
      return next;
    });
    const adapter = adapterStore.getAdapter();
    if (adapter) {
      // Always call: it also tells the mock which conversation is current,
      // so send events route here. Returned history is adopted once.
      void adapter.openConversation(BOT_ID, convId).then((msgs) => {
        if (!loadedConvsRef.current.has(convId)) {
          loadedConvsRef.current.add(convId);
          // Merge, don't replace: events may have already delivered
          // messages for this conversation while it was closed (approval
          // system lines, streamed finals) and those must survive the
          // history snapshot (§5: snapshot first, then live events).
          setMessages((prev) => {
            const existing = prev[convId] ?? [];
            const extra = existing.filter((m) => !msgs.some((s) => s.id === m.id));
            return { ...prev, [convId]: [...msgs, ...extra] };
          });
        }
      });
    } else if (!loadedConvsRef.current.has(convId)) {
      loadedConvsRef.current.add(convId);
      setMessages((prev) => ({ ...prev, [convId]: SEED_MESSAGES[convId] ?? [] }));
    }
  }, []);

  const send = useCallback(
    (convId: string) => {
      const text = (drafts[convId] ?? '').trim();
      if (!text) return;
      const adapter = adapterStore.getAdapter();
      if (!adapter) {
        toast('No adapter is constructed — see the connection panel.', true);
        return;
      }
      const clientMsgId = `cm-${Date.now()}-${++sendCounterRef.current}`;
      void adapter
        .sendMessage(BOT_ID, text, clientMsgId)
        .then(() => {
          setDrafts((prev) => ({ ...prev, [convId]: '' }));
        })
        .catch((err: unknown) => {
          // §7.3: a rejected send is surfaced, never silently dropped;
          // the draft survives because we only clear it on acceptance.
          if (err instanceof AdapterCommandError) {
            toast(`Send rejected — adapter is ${err.phase}. ${err.message}`, true);
          } else {
            toast('Send failed unexpectedly.', true);
          }
        });
    },
    [drafts, toast],
  );

  // ---- approvals: raised by the adapter as `approval.request` events;
  // resolution goes to the adapter FIRST (slice 2). Only when the adapter
  // rejects 'unsupported' does the app fall back to recording the decision
  // itself — and it says so in the toast. A 'gone' approval is dropped; a
  // 'not-ready' rejection leaves it pending. Either way the decision is
  // written to md_events as the app's decision log (§2.7). ----

  const topApproval = pendingApprovals[0];

  const resolveApproval = useCallback(
    async (decision: 'allow' | 'deny', scope?: 'once' | 'always') => {
      const target = pendingApprovals[0];
      if (!target) return;
      const adapter = adapterStore.getAdapter();
      let note = '';
      try {
        await adapter?.resolveApproval(BOT_ID, target.approval.id, decision, scope);
      } catch (err) {
        if (err instanceof AdapterCommandError && err.code === 'unsupported') {
          note = ' Recorded as an app-level decision — this adapter cannot resolve approvals.';
        } else if (err instanceof AdapterCommandError && err.code === 'gone') {
          setPendingApprovals((prev) => prev.filter((p) => p.approval.id !== target.approval.id));
          toast(`That approval is no longer pending (${err.message})`, true);
          return;
        } else if (err instanceof AdapterCommandError) {
          toast(`Could not resolve — adapter is ${err.phase}. ${err.message}`, true);
          return;
        } else {
          toast('Approval resolution failed unexpectedly.', true);
          return;
        }
      }
      setPendingApprovals((prev) => prev.filter((p) => p.approval.id !== target.approval.id));
      const ev: AppEvent = {
        id: `ev-${Date.now()}`,
        kind: 'approval.decision',
        refId: target.approval.id,
        // §2.12: the decision log shows the scope that was chosen.
        label: `${decision === 'allow' ? 'Allowed' : 'Denied'}${decision === 'allow' && scope ? ` — ${scope}` : ''}: ${target.approval.title}`,
        ts: Date.now(),
      };
      setEvents((prev) => [...prev, ev]);
      void records.create('md_events', ev);
      toast(`${ev.label}.${note}`);
    },
    [pendingApprovals, toast],
  );

  // ---- organisation actions ----

  const newProject = useCallback(() => {
    const name = window.prompt('New project name');
    if (!name?.trim()) return;
    const p: Project = {
      id: `proj-${Date.now()}`,
      name: name.trim(),
      kind: 'general',
      status: 'active',
      nextAction: '—',
    };
    const next = [...projects, p];
    setProjects(next);
    if (hydratedRef.current) void records.save('md_projects', next);
    setScope(p.id);
    toast(`Project “${p.name}” created`);
  }, [projects, toast]);

  const addSchedule = useCallback(
    (item: ScheduleItem) => {
      const next = [...schedule, item];
      setSchedule(next);
      if (hydratedRef.current) void records.save('md_schedule', next);
      toast(`Scheduled “${item.title}”`);
    },
    [schedule, toast],
  );

  const dropProposal = useCallback((id: string) => {
    const next = proposalsRef.current.filter((p) => p.id !== id);
    setProposals(next);
    if (hydratedRef.current) void records.save('md_proposals', next);
  }, []);

  const acceptProposal = useCallback(
    (proposal: ScheduleProposal) => {
      // Resolve the project: explicit id wins; a name is matched against
      // the owner's projects; an unmatched name files as Global rather
      // than inventing a project.
      const byId = proposal.projectId
        ? projects.find((p) => p.id === proposal.projectId)
        : undefined;
      const byName = proposal.projectName
        ? projects.find((p) => p.name.toLowerCase() === proposal.projectName!.toLowerCase())
        : undefined;
      addSchedule({
        id: `sched-${Date.now()}`,
        title: proposal.title,
        projectId: byId?.id ?? byName?.id ?? null,
        dayOffset: Math.min(6, Math.max(0, proposal.dayOffset ?? 1)),
        startHour: 10,
        spanHours: 1,
      });
      dropProposal(proposal.id);
    },
    [addSchedule, dropProposal, projects],
  );

  const invokeControlAction = useCallback(
    (action: SurfaceAction) => {
      const adapter = adapterStore.getAdapter();
      if (!adapter) {
        toast('No adapter is constructed — see the connection panel.', true);
        return;
      }
      void adapter.invokeAction(BOT_ID, action).catch((err: unknown) => {
        if (err instanceof AdapterCommandError) {
          toast(`Action rejected — adapter is ${err.phase}. ${err.message}`, true);
        } else {
          toast('Action failed unexpectedly.', true);
        }
      });
    },
    [toast],
  );

  const toggleResource = useCallback(
    (moduleId: string) => {
      const next = withConnection(
        resourceConns,
        moduleId,
        BOT_ID,
        !isConnected(resourceConns, moduleId, BOT_ID),
      );
      setResourceConns(next);
      if (hydratedRef.current) void records.save('md_resources', next);
    },
    [resourceConns],
  );

  // ---- derived ----

  const runningCount = Object.values(live).filter((l) => l.state === 'running').length;
  const waitingCount = conversations.filter((c) => c.status === 'waiting-on-owner' && !c.archived).length;
  const needsCount = pendingApprovals.length + finished.length + waitingCount;
  const topApprovalConv = topApproval?.conversationId
    ? conversations.find((c) => c.id === topApproval.conversationId)
    : undefined;
  const openConv = chatOpenId ? conversations.find((c) => c.id === chatOpenId) : undefined;
  const scopeProject = scope ? projects.find((p) => p.id === scope) : undefined;
  const decisions = events
    .filter((e) => e.kind === 'approval.decision')
    .map((e) => ({ label: e.label, ts: e.ts }));

  return (
    <div className="app">
      <TopStrip
        query={query}
        onQuery={(q) => {
          if (query === '' && q !== '') setView('conversations');
          setQuery(q);
        }}
      />
      <ProjectRail
        projects={projects}
        conversations={conversations}
        live={live}
        scope={scope}
        onScope={setScope}
        onNewProject={newProject}
      />

      <div className="viewbar">
        <div className="seg" role="tablist" aria-label="Views">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={`seg-btn ${view === v.id ? 'on' : ''}`}
              onClick={() => setView(v.id)}
              role="tab"
              aria-selected={view === v.id}
            >
              {v.label}
            </button>
          ))}
        </div>
        {scopeProject && (
          <span className="small">
            Scoped to <b style={{ color: 'var(--text)' }}>{scopeProject.name}</b> — click ALL WORK to clear
          </span>
        )}
      </div>

      <main className="main">
        {view === 'board' && (
          <Board
            projects={projects}
            conversations={conversations}
            live={live}
            scope={scope}
            approval={{
              id: topApproval?.approval.id ?? '',
              title: topApproval?.approval.title ?? '',
              detail: topApproval?.approval.detail ?? '',
              pending: !!topApproval,
              projectId: topApprovalConv?.projectId ?? null,
              raisedBy: topApprovalConv?.title,
              scopes: topApproval?.approval.scopes,
            }}
            decisions={decisions}
            finished={finished}
            recentlyFinished={recentlyFinished}
            schedule={schedule}
            now={snap.now}
            onOpenChat={openChat}
            onResolveApproval={(d, s) => void resolveApproval(d, s)}
            controlActions={CONTROL_ACTIONS}
            controlEnabled={!!snap.status?.capabilities.surfaceActions}
            onInvokeAction={invokeControlAction}
            resources={RESOURCE_MODULES}
            resourceConns={resourceConns}
            botId={BOT_ID}
            onToggleResource={toggleResource}
          />
        )}
        {view === 'conversations' && (
          <ConversationsTable
            conversations={conversations}
            projects={projects}
            live={live}
            scope={scope}
            query={query}
            now={snap.now}
            onChange={changeConversation}
            onOpenChat={openChat}
            onToast={toast}
          />
        )}
        {view === 'schedule' && (
          <ScheduleView
            schedule={schedule}
            projects={projects}
            scope={scope}
            now={snap.now}
            onAdd={addSchedule}
            proposals={proposals}
            onAcceptProposal={acceptProposal}
            onRejectProposal={(p) => {
              dropProposal(p.id);
              toast(`Discarded the proposed entry “${p.title}”`);
            }}
          />
        )}
        {view === 'artifacts' && (
          <ArtifactsView
            artifacts={SEED_ARTIFACTS}
            scopeName={scopeProject?.name ?? null}
            onOpen={setViewer}
          />
        )}
      </main>

      <footer className="statusbar">
        <span data-testid="footer-counts">
          <b style={{ color: 'var(--text)' }}>{runningCount}</b> chats running ·{' '}
          <b style={{ color: 'var(--text)' }}>{needsCount}</b> needs you
        </span>
        <span>
          Adapter: <b style={{ color: 'var(--text)' }}>{phase ?? '…'}</b>
          {snap.stale && (
            <>
              {' '}· <span className="stale">STALE</span>
            </>
          )}
        </span>
        <span>
          Last sync: {snap.status?.lastEventAt ? timeAgo(snap.status.lastEventAt, snap.now) : '—'}
        </span>
        <span className="right">
          <span>
            {snap.status?.adapterId === 'muse-ai'
              ? 'Muse AI adapter — local bridge + extension (fuse B)'
              : 'Simulated adapter — no real muse.ai connection'}
          </span>
        </span>
      </footer>

      {openConv && (
        <ChatPanel
          conv={openConv}
          projectName={projects.find((p) => p.id === openConv.projectId)?.name ?? 'Unfiled'}
          live={live[openConv.id]}
          messages={messages[openConv.id] ?? []}
          streamingText={streaming[openConv.id] ?? null}
          draft={drafts[openConv.id] ?? ''}
          onDraftChange={(t) => setDrafts((prev) => ({ ...prev, [openConv.id]: t }))}
          onSend={() => send(openConv.id)}
          onClose={() => setChatOpenId(null)}
        />
      )}

      {viewer && <ArtifactViewer artifact={viewer} onClose={() => setViewer(null)} />}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast panel ${t.error ? 'error' : ''}`} data-testid="toast">
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
