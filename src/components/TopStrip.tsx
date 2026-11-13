import { useEffect, useRef, useState } from 'react';
import { adapterStore, useAdapter } from '../app/useAdapter';
import { phaseLamp, timeAgo } from '../app/live';
import { MOCK_SCENARIOS, type MockScenario } from '../adapters/MockAdapter';
import type { CheckState } from '../adapters/types';
import { capabilityLabel, CHECK_STATE_WORDS } from '../app/labels';
import { useEscClose } from '../app/escStack';

const CHECK_SYMBOL: Record<CheckState, { sym: string; color: string }> = {
  pass: { sym: '✓', color: 'var(--green)' },
  warn: { sym: '⚠', color: 'var(--amber)' },
  fail: { sym: '✗', color: 'var(--red)' },
  pending: { sym: '…', color: 'var(--muted)' },
  skip: { sym: '–', color: 'var(--faint)' },
};

function fmtClock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour12: false });
}

function ConnectionPopover({ onClose }: { onClose: () => void }) {
  const snap = useAdapter();
  const { status, constructionError, transitions, stale, now } = snap;
  const mock = adapterStore.getMock();
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // R4 dialog behaviour: Escape closes (topmost surface only, via the
  // esc stack), and focus enters the dialog on open — the close
  // button is the landing target. Focus return to the lamp-cluster
  // lives in TopStrip, which owns the open state.
  useEscClose(onClose);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const runScenario = async (s: MockScenario) => {
    if (!mock || busy) return;
    setBusy(true);
    try {
      await mock.setScenario(s);
    } finally {
      setBusy(false);
    }
  };

  const reconnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await adapterStore.reconnect();
    } finally {
      setBusy(false);
    }
  };

  const passed = status?.checks.filter((c) => c.state === 'pass').length ?? 0;

  return (
    <div className="popover panel" role="dialog" aria-label="Adapter connection">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="lamp">
          <i className={phaseLamp(status?.phase ?? null)} />
        </span>
        <b style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {constructionError ? 'unconfigured' : (status?.phase ?? '…')}
        </b>
        {stale && <span className="stale mono">stale</span>}
        <button ref={closeRef} className="btn" style={{ marginLeft: 'auto', padding: '2px 9px' }} onClick={onClose} aria-label="Close connection panel">
          ✕
        </button>
      </div>

      {constructionError ? (
        <p style={{ lineHeight: 1.55, margin: '10px 0 4px' }}>{constructionError}</p>
      ) : (
        <>
          <p style={{ lineHeight: 1.55, margin: '10px 0 4px' }}>{status?.detail}</p>
          <div className="small" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>
              Identity: <b style={{ color: 'var(--text)' }}>{status?.identity?.displayName ?? '—'}</b>
            </span>
            <span>
              Bot: <b style={{ color: 'var(--text)' }}>{status?.currentBotId ?? '—'}</b>
            </span>
            <span>
              Last event:{' '}
              <b style={{ color: 'var(--text)' }}>
                {status?.lastEventAt ? timeAgo(status.lastEventAt, now) : '—'}
              </b>
            </span>
            <span>
              Checks: <b style={{ color: 'var(--text)' }}>{passed}/{status?.checks.length ?? 0}</b>
            </span>
          </div>

          {status?.error && (
            <div className="strip error-strip" style={{ margin: '10px 0 0' }}>
              {status.error.message}
              {status.error.actionHint ? ` — ${status.error.actionHint}` : ''}
            </div>
          )}

          <div className="mono" style={{ color: 'var(--muted)', margin: '14px 0 5px' }}>Capabilities</div>
          {/* R2: capabilities are a readout, not controls — rows in
              the check-row layout with friendly names (R5 labels),
              never state pills: nothing here is pressable or a state. */}
          <div>
            {status &&
              Object.entries(status.capabilities).map(([k, v]) => (
                <div className="check-row" key={k} data-testid="capability-row">
                  <span style={{ color: v ? 'var(--green)' : 'var(--red)', width: 14, textAlign: 'center' }}>
                    {v ? '✓' : '✗'}
                  </span>
                  <span>{capabilityLabel(k)}</span>
                </div>
              ))}
          </div>

          <div className="mono" style={{ color: 'var(--muted)', margin: '14px 0 5px' }}>
            Checks — shared vocabulary (§6.2)
          </div>
          <div>
            {status?.checks.map((c) => (
              <div className="check-row" key={c.id}>
                <span style={{ color: CHECK_SYMBOL[c.state].color, width: 14, textAlign: 'center' }}>
                  {CHECK_SYMBOL[c.state].sym}
                </span>
                <span>
                  {c.label}
                  {c.detail ? <span className="small"> — {c.detail}</span> : null}
                </span>
                <span className="cstate">
                  {CHECK_STATE_WORDS[c.state]}
                  {c.required ? ' · required' : ''}
                </span>
              </div>
            ))}
          </div>

          <div className="mono" style={{ color: 'var(--muted)', margin: '14px 0 5px' }}>Transition log</div>
          <div className="log-box well mono" style={{ textTransform: 'none', letterSpacing: 0 }}>
            {transitions.length === 0 && <div className="small">No transitions yet.</div>}
            {[...transitions].slice(-14).reverse().map((t, i) => (
              <div key={`${t.at}-${i}`}>
                <span style={{ color: 'var(--faint)' }}>{fmtClock(t.at)}</span> {t.text}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={reconnect} disabled={busy}>
              Reconnect
            </button>
          </div>

          {mock && (
            <>
              <div className="mono" style={{ color: 'var(--muted)', margin: '14px 0 5px' }}>
                Mock scenarios — dev controls (§8.3)
              </div>
              <div className="scenario-grid">
                {MOCK_SCENARIOS.map((s) => (
                  <button
                    key={s}
                    className={`btn small ${mock.getScenario() === s ? 'btn-primary' : ''}`}
                    onClick={() => void runScenario(s)}
                    disabled={busy}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function TopStrip({
  query,
  onQuery,
}: {
  query: string;
  onQuery: (q: string) => void;
}) {
  const snap = useAdapter();
  const { status, constructionError, stale } = snap;
  const [popOpen, setPopOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const clusterRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // R6: ⌘K / Ctrl+K focuses the search well from anywhere in the app
  // (the client's own search shortcut, S11).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!popOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setPopOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [popOpen]);

  // R4: when the popover closes (any path — Esc, outside click, the
  // close button), focus returns to the lamp-cluster that opened it.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (popOpen) {
      wasOpenRef.current = true;
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      clusterRef.current?.focus();
    }
  }, [popOpen]);

  const passed = status?.checks.filter((c) => c.state === 'pass').length ?? 0;
  const total = status?.checks.length ?? 10;
  const phase = constructionError ? 'unconfigured' : (status?.phase ?? 'unconfigured');

  return (
    <div className="topstrip">
      <div className="wordmark">
        MISSION <span>DESK</span>
      </div>

      {/* Predominant Mode switch (§2.6): a mode re-orients the whole app.
          API / Tool Chat Mode is named only — not designed, so its segment
          is flattened and inert, not a working toggle. */}
      <div className="seg" role="group" aria-label="Predominant mode">
        <button className="seg-btn on">Muse AI</button>
        <button className="seg-btn flat" disabled title="Not designed yet — reserved in DESIGN.md §2.6">
          API / Tool · future
        </button>
      </div>

      <div className="search-well well">
        <span className="search-icon" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.4" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10.4 10.4 L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <input
          ref={searchRef}
          type="search"
          placeholder="Search conversations, tags, projects…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            // R6: Escape while focused clears the query — and is the
            // input's alone (don't let it close a surface behind).
            if (e.key === 'Escape') {
              e.stopPropagation();
              onQuery('');
            }
          }}
          aria-label="Search conversations"
          data-testid="search-input"
        />
        {query !== '' && (
          <button className="search-clear" onClick={() => onQuery('')} aria-label="Clear search" data-testid="search-clear">
            ×
          </button>
        )}
      </div>

      <div style={{ position: 'relative' }} ref={popRef}>
        <button
          ref={clusterRef}
          className="lamp-cluster raised"
          onClick={() => setPopOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={popOpen}
          data-testid="lamp-cluster"
        >
          <span className="lamp">
            <i className={phaseLamp(status?.phase ?? null)} />
          </span>
          <span className="mono" style={{ color: 'var(--text)' }}>
            {status?.adapterId === 'muse-ai'
              ? 'Muse AI adapter'
              : status?.adapterId === 'mock'
                ? 'Mock adapter'
                : 'Adapter'}{' '}
            · {phase}
            {stale ? ' · stale' : ''}
          </span>
          <span className="mono" style={{ color: 'var(--muted)' }}>
            {passed}/{total}
          </span>
          {/* R1: the cluster is a status readout that is secretly a
              button — the caret is its "opens" signal, flipped while
              the popover is open (same state as aria-expanded). */}
          <span className={`caret${popOpen ? ' open' : ''}`} aria-hidden="true" data-testid="adapter-caret" />
        </button>
        {popOpen && <ConnectionPopover onClose={() => setPopOpen(false)} />}
      </div>
    </div>
  );
}
