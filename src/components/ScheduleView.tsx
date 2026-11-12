import { useState } from 'react';
import type { Project, ScheduleItem } from '../app/seed';
import { dayLabel } from './Board';

export function ScheduleView({
  schedule,
  projects,
  scope,
  now,
  onAdd,
}: {
  schedule: ScheduleItem[];
  projects: Project[];
  scope: string | null;
  now: number;
  onAdd: (item: ScheduleItem) => void;
}) {
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(0);
  const [projectId, setProjectId] = useState<string>('');

  const visible = [...schedule]
    .filter((s) => scope === null || s.projectId === scope || s.projectId === null)
    .sort((a, b) => a.dayOffset - b.dayOffset || a.startHour - b.startHour);
  const projName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? 'Global';

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onAdd({
      id: `sched-${Date.now()}`,
      title: t,
      projectId: projectId === '' ? null : projectId,
      dayOffset: day,
      startHour: 10,
      spanHours: 1,
    });
    setTitle('');
  };

  return (
    <div>
      <div className="zone-title mono">
        <b>SCHEDULE</b> · everything the bot has scheduled — a place, not a question (§2.7)
      </div>

      <div className="gantt" data-testid="gantt">
        {Array.from({ length: 7 }, (_, d) => {
          const date = new Date(now + d * 86400_000);
          const items = visible.filter((s) => s.dayOffset === d);
          return (
            <div className="gantt-day well" key={d}>
              <div className="dlabel mono">
                <span>{dayLabel(d, now)}</span>
                <span>
                  {date.toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                </span>
              </div>
              {items.map((s) => (
                <div
                  key={s.id}
                  className={`gbar ${s.awaitingOwner ? 'awaiting' : ''}`}
                  style={{ minHeight: 26 + (s.spanHours - 1) * 14 }}
                  title={`${s.title} — ${projName(s.projectId)}`}
                >
                  {s.title}
                  <div className="gtime mono" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    {String(s.startHour).padStart(2, '0')}:00 · {s.spanHours}h · {projName(s.projectId)}
                    {s.awaitingOwner ? ' · awaiting you' : ''}
                  </div>
                </div>
              ))}
              {items.length === 0 && <div className="small" style={{ color: 'var(--faint)' }}>—</div>}
            </div>
          );
        })}
      </div>

      <div className="split" style={{ marginTop: 12 }}>
        <div className="panel" style={{ padding: '10px 12px' }}>
          <div className="zone-title mono">
            <b>ALL ENTRIES</b>
          </div>
          <div className="rows">
            {visible.map((s) => (
              <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span className="mono" style={{ color: s.awaitingOwner ? 'var(--amber)' : 'var(--blue)', minWidth: 110 }}>
                  {dayLabel(s.dayOffset, now)} {String(s.startHour).padStart(2, '0')}:00
                </span>
                <span>
                  {s.title} <span className="small">· {projName(s.projectId)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <form
          className="panel"
          style={{ padding: '10px 12px' }}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="zone-title mono">
            <b>ADD ENTRY</b>
          </div>
          <div className="well field-wrap" style={{ marginBottom: 8 }}>
            <input
              placeholder="Entry title…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Entry title"
              data-testid="sched-title"
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="well field-wrap" style={{ flex: 1 }}>
              <select value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label="Day" data-testid="sched-day">
                {Array.from({ length: 7 }, (_, d) => (
                  <option key={d} value={d}>
                    {dayLabel(d, now)}
                  </option>
                ))}
              </select>
            </div>
            <div className="well field-wrap" style={{ flex: 1 }}>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project">
                <option value="">Global</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" type="submit" data-testid="sched-add">
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
