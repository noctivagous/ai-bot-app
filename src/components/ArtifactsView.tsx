import type { ArtifactItem } from '../app/seed';

export function Provenance({ a }: { a: ArtifactItem }) {
  const p = a.provenance;
  return (
    <div className="prov well">
      bot: <b>{p.bot}</b> · chat: <b>{p.chat}</b>
      <br />
      project: <b>{p.project}</b> · goal: <b>{p.goal}</b>
    </div>
  );
}

export function ArtifactsView({
  artifacts,
  scopeName,
  onOpen,
}: {
  artifacts: ArtifactItem[];
  scopeName: string | null;
  onOpen: (a: ArtifactItem) => void;
}) {
  const visible = scopeName === null ? artifacts : artifacts.filter((a) => a.provenance.project === scopeName);
  return (
    <div>
      <div className="zone-title mono">
        <b>ARTIFACTS</b> · attached to the bot, chat, project and goal that produced them (§2.7)
      </div>
      <div className="art-grid">
        {visible.map((a) => (
          <div className="art-card panel" key={a.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <b style={{ fontSize: 13.5 }}>{a.name}</b>
              <span className="chip chip-idle">{a.kind}</span>
            </div>
            <p className="small" style={{ lineHeight: 1.5, margin: '7px 0 0' }}>
              {a.description}
            </p>
            <Provenance a={a} />
            <button className="btn" style={{ marginTop: 10 }} onClick={() => onOpen(a)}>
              Open
            </button>
          </div>
        ))}
        {visible.length === 0 && <div className="empty-note panel">No artifacts in this scope.</div>}
      </div>
    </div>
  );
}

export function ArtifactViewer({ artifact, onClose }: { artifact: ArtifactItem; onClose: () => void }) {
  return (
    <div className="slideover" role="dialog" aria-label={`Artifact: ${artifact.name}`} style={{ width: 'min(42%, 560px)' }}>
      <header>
        <div className="grow" style={{ flex: 1 }}>
          <b style={{ fontSize: 14.5 }}>{artifact.name}</b>
          <div className="mono" style={{ color: 'var(--muted)', marginTop: 2 }}>
            artifact · {artifact.kind} · hosted by Muse (§2.5 — the app holds the links)
          </div>
        </div>
        <button className="btn" onClick={onClose} aria-label="Close viewer">
          ✕ Close
        </button>
      </header>
      <div style={{ padding: 16, overflowY: 'auto' }}>
        <p style={{ lineHeight: 1.6 }}>{artifact.description}</p>
        <div className="mono" style={{ color: 'var(--muted)', margin: '16px 0 6px' }}>Provenance</div>
        <Provenance a={artifact} />
        <p className="small" style={{ marginTop: 14, lineHeight: 1.6 }}>
          In the full app this viewer is a WebView tab rendering the artifact where it lives, next to its
          project — not an undifferentiated Library grid. The hosted artifact itself stays Muse's (§10).
        </p>
      </div>
    </div>
  );
}
