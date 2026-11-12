import type { ConversationRecord, Project, ScheduleItem } from '../app/seed';
import { conversationChip, formatElapsed, projectLamp, type LiveMap } from '../app/live';

export interface ApprovalState {
  id: string;
  title: string;
  detail: string;
  pending: boolean;
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
  schedule,
  now,
  onOpenChat,
  onResolveApproval,
}: {
  projects: Project[];
  conversations: ConversationRecord[];
  live: LiveMap;
  scope: string | null;
  approval: ApprovalState;
  decisions: Array<{ label: string; ts: number }>;
  finished: FinishedItem[];
  schedule: ScheduleItem[];
  now: number;
  onOpenChat: (conversationId: string) => void;
  onResolveApproval: (decision: 'allow' | 'deny') => void;
}) {
  const convById = new Map(conversations.map((c) => [c.id, c]));
  const projName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? '—';
  const inScope = (c: ConversationRecord) => scope === null || c.projectId === scope;

  const aleConv = convById.get('conv-ale');
  const showAle = aleConv && !aleConv.archived && inScope(aleConv);
  const visibleFinished = finished.filter((f) => {
    const c = convById.get(f.conversationId);
    return c && inScope(c);
  });
  const needsCount =
    (approval.pending && (scope === null || scope === 'proj-nibglider') ? 1 : 0) +
    (showAle ? 1 : 0) +
    visibleFinished.length;

  const jobs = JOB_CONVERSATIONS.map((id) => convById.get(id)).filter(
    (c): c is ConversationRecord => !!c && inScope(c),
  );
  const glanceProjects = scope === null ? projects : projects.filter((p) => p.id === scope);
  const comingUp = [...schedule]
    .filter((s) => scope === null || s.projectId === scope || s.projectId === null)
    .sort((a, b) => a.dayOffset - b.dayOffset || a.startHour - b.startHour)
    .slice(0, 4);

  return (
    <div>
      {/* ---- NEEDS YOU ---- */}
      <section className="zone" aria-label="Needs you">
        <div className="zone-title mono">
          <b>NEEDS YOU</b> · {needsCount} item{needsCount === 1 ? '' : 's'}
        </div>
        <div className="rows">
          {approval.pending && (scope === null || scope === 'proj-nibglider') && (
            <div className="attn-row panel approval" data-testid="approval-row">
              <span className="lamp">
                <i className="on-amber" />
              </span>
              <div className="grow">
                <b>{approval.title}</b>
                <div className="small">{approval.detail} · raised by the NibGlider chat</div>
              </div>
              <button className="btn btn-primary" onClick={() => onResolveApproval('allow')} data-testid="approval-allow">
                Allow
              </button>
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
                <div className="jact">{l ? l.activity : 'Queued — waiting for the adapter…'}</div>
                <div className="progress">
                  <i style={{ width: `${l?.progress ?? 0}%` }} />
                </div>
                <div className="jmeta">
                  <span className="mono" style={{ color: 'var(--muted)' }}>
                    {done ? 'done' : running ? `elapsed ${formatElapsed(l.elapsedSec)}` : 'not started'}
                  </span>
                  <button className="btn" style={{ padding: '3px 10px' }} onClick={() => onOpenChat(c.id)}>
                    Open
                  </button>
                </div>
              </div>
            );
          })}
          {jobs.length === 0 && <div className="empty-note panel">No running jobs in this scope.</div>}
        </div>
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
    </div>
  );
}
