import { useState } from 'react';
import type { ConversationRecord, ConversationStatus, Project } from '../app/seed';
import { conversationChip, timeAgo, type LiveMap } from '../app/live';

const STATUSES: ConversationStatus[] = ['active', 'waiting-on-owner', 'waiting-on-bot', 'parked', 'done'];

function InboxRow({
  conv,
  projects,
  onFile,
}: {
  conv: ConversationRecord;
  projects: Project[];
  onFile: (conv: ConversationRecord, projectId: string) => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  return (
    <div className="attn-row panel" data-testid="inbox-row">
      <span className="lamp">
        <i className="on-amber" />
      </span>
      <div className="grow">
        <b>{conv.title}</b>
        <div className="small">Unfiled — the adapter reported it; filing it is yours.</div>
      </div>
      <select
        className="cell-select"
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        aria-label="File into project"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button className="btn btn-primary" onClick={() => onFile(conv, projectId)} data-testid="inbox-file">
        File it
      </button>
    </div>
  );
}

export function ConversationsTable({
  conversations,
  projects,
  live,
  scope,
  query,
  now,
  onChange,
  onOpenChat,
  onToast,
}: {
  conversations: ConversationRecord[];
  projects: Project[];
  live: LiveMap;
  scope: string | null;
  query: string;
  now: number;
  onChange: (conv: ConversationRecord) => void;
  onOpenChat: (id: string) => void;
  onToast: (text: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [tagForId, setTagForId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState('');

  const projName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? 'Unfiled';

  const inbox = conversations.filter((c) => c.projectId === null && !c.pinned && !c.archived);
  const q = query.trim().toLowerCase();
  const rows = conversations
    .filter((c) => c.projectId !== null || c.pinned) // unfiled-unpinned live in the Inbox
    .filter((c) => scope === null || c.projectId === scope)
    .filter((c) => showArchived || !c.archived)
    .filter((c) => statusFilter === 'all' || c.status === statusFilter)
    .filter(
      (c) =>
        !q ||
        c.title.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)) ||
        projName(c.projectId).toLowerCase().includes(q),
    )
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastActivityAt - a.lastActivityAt);

  const saveTitle = (c: ConversationRecord) => {
    const title = titleDraft.trim();
    setEditingId(null);
    if (title && title !== c.title) {
      onChange({ ...c, title, lastActivityAt: Date.now() });
      onToast(`Retitled to “${title}”`);
    }
  };

  const saveTag = (c: ConversationRecord) => {
    const tag = tagDraft.trim().toLowerCase();
    setTagForId(null);
    setTagDraft('');
    if (tag && !c.tags.includes(tag)) onChange({ ...c, tags: [...c.tags, tag] });
  };

  return (
    <div>
      {inbox.length > 0 && (scope === null) && (
        <section className="zone" aria-label="Inbox">
          <div className="zone-title mono">
            <b>INBOX</b> · {inbox.length} unfiled — triage is a filing act, not a chat request
          </div>
          <div className="rows">
            {inbox.map((c) => (
              <InboxRow
                key={c.id}
                conv={c}
                projects={projects}
                onFile={(conv, projectId) => {
                  onChange({ ...conv, projectId, lastActivityAt: Date.now() });
                  onToast(`Filed “${conv.title}” into ${projName(projectId)}`);
                }}
              />
            ))}
          </div>
        </section>
      )}

      <section className="zone" aria-label="Conversations database">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <span className="zone-title mono" style={{ margin: 0 }}>
            <b>CONVERSATIONS</b> · the database, not a list
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="cell-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/-/g, ' ')}
                </option>
              ))}
            </select>
            <label className="small" style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              show archived
            </label>
          </span>
        </div>

        <div className="table-wrap panel">
          <table className="grid" data-testid="conv-table">
            <thead>
              <tr>
                <th>State</th>
                <th>Title</th>
                <th>Project</th>
                <th>Tags</th>
                <th>Status</th>
                <th>Goal</th>
                <th>Last activity</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const chip = conversationChip(c, live[c.id]);
                return (
                  <tr key={c.id} data-testid={`conv-row-${c.id}`} style={c.archived ? { opacity: 0.5 } : undefined}>
                    <td>
                      <span className={`chip ${chip.cls}`}>
                        {chip.pulse && <span className="pulse" />}
                        {chip.label}
                      </span>
                    </td>
                    <td style={{ minWidth: 210 }}>
                      {editingId === c.id ? (
                        <input
                          className="title-edit"
                          value={titleDraft}
                          autoFocus
                          onChange={(e) => setTitleDraft(e.target.value)}
                          onBlur={() => saveTitle(c)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveTitle(c);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          aria-label="Conversation title"
                          data-testid="title-edit"
                        />
                      ) : (
                        <>
                          <button
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'text', textAlign: 'left', fontWeight: 600 }}
                            onClick={() => {
                              setEditingId(c.id);
                              setTitleDraft(c.title);
                            }}
                            title="Click to rename — titles are owned by the app"
                            data-testid={`title-${c.id}`}
                          >
                            {c.title}
                            {c.pinned ? ' 📌' : ''}
                          </button>
                          {c.proposedTitle && (
                            <div className="small" style={{ marginTop: 4 }} data-testid="retitle-proposal">
                              Bot proposes: “{c.proposedTitle}”{' '}
                              <button
                                className="btn"
                                style={{ padding: '1px 8px', fontSize: 11.5 }}
                                onClick={() => {
                                  onChange({ ...c, title: c.proposedTitle!, proposedTitle: undefined });
                                  onToast('Retitle accepted');
                                }}
                              >
                                Accept
                              </button>{' '}
                              <button
                                className="btn"
                                style={{ padding: '1px 8px', fontSize: 11.5 }}
                                onClick={() => onChange({ ...c, proposedTitle: undefined })}
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      <select
                        className="cell-select"
                        value={c.projectId ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          onChange({ ...c, projectId: v === '' ? null : v, lastActivityAt: Date.now() });
                          onToast(`Filed “${c.title}” into ${projName(v === '' ? null : v)}`);
                        }}
                        aria-label="Project"
                        data-testid={`project-select-${c.id}`}
                      >
                        <option value="">Unfiled</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ minWidth: 130 }}>
                      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        {c.tags.map((t) => (
                          <span className="tag" key={t}>
                            {t}
                            <button
                              aria-label={`Remove tag ${t}`}
                              onClick={() => onChange({ ...c, tags: c.tags.filter((x) => x !== t) })}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                        {tagForId === c.id ? (
                          <input
                            className="title-edit"
                            style={{ width: 90 }}
                            value={tagDraft}
                            autoFocus
                            placeholder="tag…"
                            onChange={(e) => setTagDraft(e.target.value)}
                            onBlur={() => saveTag(c)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveTag(c);
                              if (e.key === 'Escape') setTagForId(null);
                            }}
                            aria-label="New tag"
                          />
                        ) : (
                          <button
                            className="btn"
                            style={{ padding: '0 7px', fontSize: 12 }}
                            onClick={() => {
                              setTagForId(c.id);
                              setTagDraft('');
                            }}
                            aria-label="Add tag"
                          >
                            +
                          </button>
                        )}
                      </span>
                    </td>
                    <td>
                      <select
                        className="cell-select"
                        value={c.status}
                        onChange={(e) => onChange({ ...c, status: e.target.value as ConversationStatus })}
                        aria-label="Status"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.replace(/-/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="small">{c.goal}</td>
                    <td className="small">{timeAgo(c.lastActivityAt, now)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn" style={{ padding: '2px 9px' }} onClick={() => onOpenChat(c.id)}>
                        Open
                      </button>{' '}
                      <button
                        className="btn"
                        style={{ padding: '2px 9px' }}
                        onClick={() => onChange({ ...c, pinned: !c.pinned })}
                        aria-label={c.pinned ? 'Unpin' : 'Pin'}
                      >
                        {c.pinned ? 'Unpin' : 'Pin'}
                      </button>{' '}
                      <button
                        className="btn"
                        style={{ padding: '2px 9px' }}
                        onClick={() => onChange({ ...c, archived: !c.archived })}
                      >
                        {c.archived ? 'Unarchive' : 'Archive'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-note">
                    No conversations match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
