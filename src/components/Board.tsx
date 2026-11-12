import { useState } from 'react';
import type { ConversationRecord, Project, ScheduleItem } from '../app/seed';
import type { SurfaceAction } from '../adapters/types';
import {
  RESOURCE_KIND_LABELS,
  isConnected,
  type ResourceConnection,
  type ResourceKind,
  type ResourceModule,
} from '../app/resources';
import {
  conversationChip,
  formatElapsed,
  projectLamp,
  timeAgo,
  type LiveMap,
  type RecentFinish,
} from '../app/live';

export interface ApprovalState {
  id: string;
  title: string;
  detail: string;
  pending: boolean;
  /** Project of the conversation that raised it (board scoping). */
  projectId?: string | null;
  raisedBy?: string;
  /** Scopes the page offers (§2.12); absent → plain Allow/Deny. */
  scopes?: Array<'once' | 'always'>;
}

export interface FinishedItem {
  conversationId: string;
  label: string;
}

const JOB_CONVERSATIONS = ['conv-nibglider', 'conv-ansci', 'conv-ai-bot-app'];
const DAY_WORDS = ['Today', 'Tomorrow'];

export function dayLabel(dayOffset: number, now: number): string {
  if (dayOffset < 2) return DAY_WORDS[dayOffset]!;
  return new Date(now + dayOffset * 86400_000).toLocaleDateString([], { weekday: 'short' });
}

export function Board({
  projects,
  conversations,
  live,
  scope,
  approval,
  decisions,
  finished,
  recentlyFinished,
  schedule,
  now,
  onOpenChat,
  onResolveApproval,
  controlActions,
  controlEnabled,
  onInvokeAction,
  resources,
  resourceConns,
  botId,
  onToggleResource,
}: {
  projects: Project[];
  conversations: ConversationRecord[];
  live: LiveMap;
  scope: string | null;
  approval: ApprovalState;
  decisions: Array<{ label: string; ts: number }>;
  finished: FinishedItem[];
  recentlyFinished: RecentFinish[];
  schedule: ScheduleItem[];
  now: number;
  onOpenChat: (conversationId: string) => void;
  onResolveApproval: (decision: 'allow' | 'deny', scope?: 'once' | 'always') => void;
  /** Control Panel (§10): bot surface actions via invokeAction. */
  controlActions: SurfaceAction[];
  controlEnabled: boolean;
  onInvokeAction: (action: SurfaceAction) => void;
  /** Resources (§10, second plug-in kind): registry + toggles only. */
  resources: ResourceModule[];
  resourceConns: ResourceConnection[];
  botId: string;
  onToggleResource: (moduleId: string) => void;
}) {
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const convById = new Map(conversations.map((c) => [c.id, c]));
  const projName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? '—';
  const inScope = (c: ConversationRecord) => scope === null || c.projectId === scope;

  const aleConv = convById.get('conv-ale');
  const showAle = aleConv && !aleConv.archived && inScope(aleConv);
  const visibleFinished = finished.filter((f) => {
    const c = convById.get(f.conversationId);
    return c && inScope(c);
  });
  const approvalInScope =
    approval.pending && (scope === null || approval.projectId === scope || approval.projectId == null);
  const needsCount = (approvalInScope ? 1 : 0) + (showAle ? 1 : 0) + visibleFinished.length;

  // Running Now: the seed job conversations, PLUS any conversation the
  // adapter reports live activity for. (The hard-coded trio alone could
  // never show real-adapter activity, which belongs to whichever
  // conversation the page is working in — §2.10/§9.)
  const extraJobIds = conversations
    .filter((c) => live[c.id]?.state === 'running' && !JOB_CONVERSATIONS.includes(c.id))
    .map((c) => c.id);
  const jobs = [...JOB_CONVERSATIONS, ...extraJobIds]
    .map((id) => convById.get(id))
    .filter((c): c is ConversationRecord => !!c && inScope(c));
  const glanceProjects = scope === null ? projects : projects.filter((p) => p.id === scope);
  const comingUp = [...schedule]
    .filter((s) => scope === null || s.projectId === scope || s.projectId === null)
    .sort((a, b) => a.dayOffset - b.dayOffset || a.startHour - b.startHour)
    .slice(0, 4);

  return (
    <div>
      {/* ---- ACTIVITY (D2 umbrella, FEATURE-MAP S6): "Activity" is the
          client's word for the single list these zones group. The zones
          underneath are the desk's own grouping invention over that
          list — kept as-is, and labelled as ours by the subline. ---- */}
      <section aria-label="Activity">
        <div className="zone-title mono activity-head" data-testid="activity-umbrella">
          <b>ACTIVITY</b>
        </div>
        <div className="small activity-sub">
          The desk’s grouping of Muse’s Activity — approvals, running work, and what just finished.
        </div>

      {/* ---- NEEDS YOU ---- */}
      <section className="zone" aria-label="Needs you">
        <div className="zone-title mono">
          <b>NEEDS YOU</b> · {needsCount} item{needsCount === 1 ? '' : 's'}
        </div>
        <div className="rows">
          {approvalInScope && (
            <div className="attn-row panel approval" data-testid="approval-row">
              <span className="lamp">
                <i className="on-amber" />
              </span>
              <div className="grow">
                <b>{approval.title}</b>
                <div className="small">
                  {approval.detail}
                  {approval.raisedBy ? ` · raised by ${approval.raisedBy}` : ''}
                </div>
              </div>
              {approval.scopes?.includes('always') ? (
                <>
                  <button className="btn btn-primary" onClick={() => onResolveApproval('allow', 'once')} data-testid="approval-allow">
                    Allow once
                  </button>
                  <button className="btn" onClick={() => onResolveApproval('allow', 'always')} data-testid="approval-always">
                    Always allow
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={() => onResolveApproval('allow')} data-testid="approval-allow">
                  Allow
                </button>
              )}
              <button className="btn btn-danger" onClick={() => onResolveApproval('deny')} data-testid="approval-deny">
                Deny
              </button>
            </div>
          )}

          {showAle && (
            <div className="attn-row panel">
              <span className="lamp">
                <i className="on-amber" />
              </span>
              <div className="grow">
                <b>ALE slices 5–11 — built + verified, awaiting your push decision</b>
                <div className="small">feat/musecode-slices-5-11 · gate 1470/1466 (4 failures pre-existing on main)</div>
              </div>
              <button className="btn" onClick={() => onOpenChat('conv-ale')}>
                Open chat
              </button>
            </div>
          )}

          {visibleFinished.map((f) => (
            <div className="attn-row panel done-row" key={f.conversationId} data-testid="finished-row">
              <span className="lamp">
                <i className="on-green" />
              </span>
              <div className="grow">
                <b>Finished — {f.label}</b>
                <div className="small">Completed while you were elsewhere. Unread.</div>
              </div>
              <button className="btn" onClick={() => onOpenChat(f.conversationId)}>
                Open chat
              </button>
            </div>
          ))}

          {needsCount === 0 && <div className="empty-note panel">Nothing needs you right now.</div>}

          {decisions.length > 0 && (
            <div className="small" style={{ padding: '2px 4px' }}>
              Decision log:{' '}
              {decisions.map((d) => (
                <span key={d.ts} style={{ marginRight: 12 }}>
                  {d.label} · {new Date(d.ts).toLocaleTimeString([], { hour12: false })}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---- RUNNING NOW ---- */}
      <section className="zone" aria-label="Running now">
        <div className="zone-title mono">
          <b>RUNNING NOW</b> · parallel work, checked at a glance — no chat needs opening
        </div>
        <div className="jobs">
          {jobs.map((c) => {
            const l = live[c.id];
            const running = l?.state === 'running';
            const done = l?.state === 'done';
            const chip = conversationChip(c, l);
            return (
              <div className={`job-card panel ${running ? 'running' : ''}`} key={c.id} data-testid={`job-${c.id}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span className="jtitle">{c.title}</span>
                  <span className={`chip ${chip.cls}`}>
                    {chip.pulse && <span className="pulse" />}
                    {chip.label}
                  </span>
                </div>
                <div className="mono" style={{ color: 'var(--muted)', marginTop: 3 }}>
                  {projName(c.projectId)}
                </div>
                {l?.title && l.title !== c.title && (
                  <div className="jact" style={{ fontWeight: 600 }}>
                    {l.title}
                  </div>
                )}
                <div className="jact">{l ? l.activity : 'Queued — waiting for the adapter…'}</div>
                <div className="progress">
                  <i style={{ width: `${l?.progress ?? 0}%` }} />
                </div>
                <div className="jmeta">
                  <span className="mono" style={{ color: 'var(--muted)' }}>
                    {done ? 'done' : running ? `elapsed ${formatElapsed(l.elapsedSec)}` : 'not started'}
                  </span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn"
                      style={{ padding: '3px 10px' }}
                      onClick={() => setExpandedJob(expandedJob === c.id ? null : c.id)}
                      aria-expanded={expandedJob === c.id}
                      data-testid={`job-expand-${c.id}`}
                    >
                      {expandedJob === c.id ? 'Hide detail' : 'Detail'}
                    </button>
                    <button className="btn" style={{ padding: '3px 10px' }} onClick={() => onOpenChat(c.id)}>
                      Open
                    </button>
                  </span>
                </div>
                {expandedJob === c.id && (
                  <div className="well jdetail" data-testid={`job-detail-${c.id}`}>
                    <div className="mono" style={{ color: 'var(--muted)', marginBottom: 3 }}>
                      WHAT IT IS DOING
                    </div>
                    <div>{done && l?.outcome ? l.outcome : (l?.detail ?? 'No detail reported yet.')}</div>
                    {done && l?.detail && <div className="small" style={{ marginTop: 4 }}>Last step: {l.detail}</div>}
                  </div>
                )}
              </div>
            );
          })}
          {jobs.length === 0 && <div className="empty-note panel">No running jobs in this scope.</div>}
        </div>

        {recentlyFinished.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="zone-title mono">
              <b>RECENTLY FINISHED</b> · past activities, with outcomes (§2.10)
            </div>
            <div className="rows">
              {recentlyFinished
                .filter((r) => {
                  const c = convById.get(r.conversationId);
                  return c && inScope(c);
                })
                .map((r) => (
                  <div className="attn-row panel" key={r.conversationId} data-testid={`recent-${r.conversationId}`}>
                    <span className="lamp">
                      <i className="on-green" />
                    </span>
                    <div className="grow">
                      <b>{r.title}</b>
                      <div className="small">
                        {r.outcome ?? r.detail ?? 'Finished.'} · {timeAgo(r.at, now)}
                      </div>
                    </div>
                    <button className="btn" onClick={() => onOpenChat(r.conversationId)}>
                      Open chat
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </section>
      </section>

      {/* ---- PROJECTS AT A GLANCE + COMING UP ---- */}
      <section className="zone split" aria-label="Projects and schedule">
        <div className="panel">
          <div className="zone-title mono" style={{ padding: '10px 12px 0' }}>
            <b>PROJECTS AT A GLANCE</b>
          </div>
          <table className="grid">
            <thead>
              <tr>
                <th>Project</th>
                <th>Status</th>
                <th>Open</th>
                <th>Next action</th>
              </tr>
            </thead>
            <tbody>
              {glanceProjects.map((p) => {
                const open = conversations.filter(
                  (c) => c.projectId === p.id && !c.archived && c.status !== 'done',
                ).length;
                return (
                  <tr key={p.id}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <span className="lamp">
                          <i className={projectLamp(p.status)} />
                        </span>
                        <b>{p.name}</b>
                      </span>
                    </td>
                    <td className="mono" style={{ color: 'var(--muted)' }}>
                      {p.kind} · {p.status.replace('-', ' ')}
                    </td>
                    <td>{open}</td>
                    <td className="small">{p.nextAction}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="panel" style={{ padding: '10px 12px 12px' }}>
          <div className="zone-title mono">
            <b>COMING UP</b>
          </div>
          <div className="rows">
            {comingUp.map((s) => (
              <div key={s.id} style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
                <span className="mono" style={{ color: s.awaitingOwner ? 'var(--amber)' : 'var(--blue)', minWidth: 86 }}>
                  {dayLabel(s.dayOffset, now)} {String(s.startHour).padStart(2, '0')}:00
                </span>
                <span>
                  {s.title}
                  {s.awaitingOwner && <span className="small"> · awaiting you</span>}
                </span>
              </div>
            ))}
            {comingUp.length === 0 && <div className="empty-note">Nothing scheduled in this scope.</div>}
          </div>
        </div>
      </section>

      {/* ---- CONTROL PANEL + RESOURCES (§10, slice 7) ---- */}
      <section className="zone split" aria-label="Control panel and resources">
        <div className="panel" style={{ padding: '10px 12px 12px' }}>
          <div className="zone-title mono">
            <b>CONTROL PANEL</b> · the bot's command surface
          </div>
          <div className="rows">
            {controlActions.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                <button
                  className="btn"
                  disabled={!controlEnabled}
                  onClick={() => onInvokeAction(a)}
                  data-testid={`action-${a.id}`}
                >
                  {a.label}
                </button>
                <span className="small">
                  {controlEnabled ? 'via invokeAction' : 'unavailable — adapter does not offer surface actions'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" style={{ padding: '10px 12px 12px' }}>
          <div className="zone-title mono">
            <b>RESOURCES</b> · global modules, connectable per bot
          </div>
          <div className="small" style={{ marginBottom: 8 }}>
            Registry and connections only in this tranche — no data flows behind these modules yet.
          </div>
          <div className="rows">
            {(Object.keys(RESOURCE_KIND_LABELS) as ResourceKind[]).map((kind) => (
              <div key={kind}>
                <div className="mono" style={{ color: 'var(--muted)', margin: '4px 0' }}>
                  {RESOURCE_KIND_LABELS[kind]} · {resources.filter((r) => r.kind === kind).length}
                </div>
                {resources
                  .filter((r) => r.kind === kind)
                  .map((r) => {
                    const connected = isConnected(resourceConns, r.id, botId);
                    return (
                      <div
                        key={r.id}
                        style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '2px 0' }}
                        data-testid={`resource-${r.id}`}
                      >
                        <span className="grow">
                          {r.name}
                          <span className="small"> — {r.detail}</span>
                        </span>
                        <button
                          className={`btn ${connected ? 'btn-primary' : ''}`}
                          onClick={() => onToggleResource(r.id)}
                          aria-pressed={connected}
                          data-testid={`resource-toggle-${r.id}`}
                        >
                          {connected ? 'Connected' : 'Connect'}
                        </button>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
