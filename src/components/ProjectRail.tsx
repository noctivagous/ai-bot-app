import type { ConversationRecord, Project } from '../app/seed';
import { projectLamp, type LiveMap } from '../app/live';

export function ProjectRail({
  projects,
  conversations,
  live,
  scope,
  onScope,
  onNewProject,
}: {
  projects: Project[];
  conversations: ConversationRecord[];
  live: LiveMap;
  scope: string | null;
  onScope: (projectId: string | null) => void;
  onNewProject: () => void;
}) {
  const rollup = (list: ConversationRecord[]) => {
    const running = list.filter((c) => live[c.id]?.state === 'running').length;
    const waiting = list.filter((c) => c.status === 'waiting-on-owner').length;
    return { running, waiting, chats: list.length };
  };
  const filed = conversations.filter((c) => !c.archived);
  const all = rollup(filed);

  const card = (
    id: string | null,
    name: string,
    kindLine: string,
    statusWord: string,
    lampCls: string,
    r: { running: number; waiting: number; chats: number },
  ) => (
    <button
      key={id ?? 'all'}
      className={`proj-card raised ${scope === id ? 'selected' : ''}`}
      onClick={() => onScope(id)}
      data-testid={`project-card-${id ?? 'all'}`}
    >
      <div className="pname">
        <span className="lamp">
          <i className={lampCls} />
        </span>
        {name}
      </div>
      <div className="mono" style={{ color: 'var(--muted)', marginTop: 3 }}>
        {kindLine} · {statusWord}
      </div>
      <div className="proll">
        {r.running} running · {r.waiting} waiting on you · {r.chats} chats
      </div>
    </button>
  );

  return (
    <div className="rail" aria-label="Projects">
      {card(null, 'ALL WORK', 'every project', 'overview', 'on-blue', all)}
      {projects.map((p) => {
        const list = filed.filter((c) => c.projectId === p.id);
        return card(p.id, p.name, p.kind, p.status.replace('-', ' '), projectLamp(p.status), rollup(list));
      })}
      <button className="proj-card raised new-card" onClick={onNewProject} data-testid="new-project">
        + NEW PROJECT
      </button>
    </div>
  );
}
