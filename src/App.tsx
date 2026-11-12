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
  SEED_APPROVAL,
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
} from './app/seed';
import { timeAgo, type LiveMap, type ToastMsg } from './app/live';
import { AdapterCommandError, type AdapterPhase, type ChatMsg } from './adapters/types';
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
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

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
      const [p, c, s, e] = await Promise.all([
        loadCollection('md_projects', SEED_PROJECTS),
        loadCollection('md_conversations', SEED_CONVERSATIONS),
        loadCollection('md_schedule', SEED_SCHEDULE),
        loadCollection<AppEvent>('md_events', []),
      ]);
      if (cancelled) return;
      setProjects(p);
      setConversations(c);
      setSchedule(s);
      setEvents(e);
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
    setMessages((prev) => ({ ...prev, [convId]: [...(prev[convId] ?? []), msg] }));
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
          const patch = e.patch as {
            conversationId: string;
            state: 'running' | 'done';
            activity: string;
            progress: number;
            elapsedSec: number;
          };
          setLive((prev) => {
            const was = prev[patch.conversationId];
            if (patch.state === 'done' && was?.state !== 'done') {
              const title =
                conversationsRef.current.find((c) => c.id === patch.conversationId)?.title ??
                patch.conversationId;
              queueMicrotask(() => {
                toast(`${title} finished — ${patch.activity}`);
                setFinished((f) => [
                  ...f.filter((x) => x.conversationId !== patch.conversationId),
                  { conversationId: patch.conversationId, label: title },
                ]);
              });
            }
            return {
              ...prev,
              [patch.conversationId]: {
                state: patch.state,
                activity: patch.activity,
                progress: patch.progress,
                elapsedSec: patch.elapsedSec,
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
          setMessages((prev) => ({ ...prev, [convId]: msgs }));
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

  // ---- approval: app-level decision in this slice (§8.3 — the adapter's
  // resolveApproval is 'unsupported' until slice 6; we surface that, we do
  // not fake an adapter success) ----

  const approvalPending = !events.some(
    (e) => e.kind === 'approval.decision' && e.refId === SEED_APPROVAL.id,
  );

  const resolveApproval = useCallback(
    async (decision: 'allow' | 'deny') => {
      const adapter = adapterStore.getAdapter();
      let note = '';
      try {
        await adapter?.resolveApproval(BOT_ID, SEED_APPROVAL.id, decision);
      } catch (err) {
        if (err instanceof AdapterCommandError && err.code === 'unsupported') {
          note = ' Recorded as an app-level decision — adapter resolution arrives in slice 6.';
        }
      }
      const ev: AppEvent = {
        id: `ev-${Date.now()}`,
        kind: 'approval.decision',
        refId: SEED_APPROVAL.id,
        label: `${decision === 'allow' ? 'Allowed' : 'Denied'}: ${SEED_APPROVAL.title}`,
        ts: Date.now(),
      };
      setEvents((prev) => [...prev, ev]);
      void records.create('md_events', ev);
      toast(`${ev.label}.${note}`);
    },
    [toast],
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

  // ---- derived ----

  const runningCount = Object.values(live).filter((l) => l.state === 'running').length;
  const waitingCount = conversations.filter((c) => c.status === 'waiting-on-owner' && !c.archived).length;
  const needsCount = (approvalPending ? 1 : 0) + finished.length + waitingCount;
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
            approval={{ ...SEED_APPROVAL, pending: approvalPending }}
            decisions={decisions}
            finished={finished}
            schedule={schedule}
            now={snap.now}
            onOpenChat={openChat}
            onResolveApproval={(d) => void resolveApproval(d)}
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
          <ScheduleView schedule={schedule} projects={projects} scope={scope} now={snap.now} onAdd={addSchedule} />
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
          <span>Simulated adapter — no real muse.ai connection</span>
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
