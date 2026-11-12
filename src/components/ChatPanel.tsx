import { useEffect, useRef } from 'react';
import type { ChatMsg } from '../adapters/types';
import type { ConversationRecord } from '../app/seed';
import { useAdapter } from '../app/useAdapter';
import { conversationChip, type LiveState } from '../app/live';

export function ChatPanel({
  conv,
  projectName,
  live,
  messages,
  streamingText,
  draft,
  onDraftChange,
  onSend,
  onClose,
}: {
  conv: ConversationRecord;
  projectName: string;
  live?: LiveState;
  messages: ChatMsg[];
  streamingText: string | null;
  draft: string;
  onDraftChange: (t: string) => void;
  onSend: () => void;
  onClose: () => void;
}) {
  const snap = useAdapter();
  const status = snap.status;
  const phase = snap.constructionError ? 'error' : (status?.phase ?? 'unconfigured');
  const canSend = phase === 'ready' || phase === 'degraded';
  const chip = conversationChip(conv, live);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingText]);

  const lostCaps = status
    ? Object.entries(status.capabilities)
        .filter(([, v]) => !v)
        .map(([k]) => k)
    : [];

  return (
    <div className="slideover" role="dialog" aria-label={`Chat: ${conv.title}`} data-testid="chat-panel">
      <header>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14.5 }}>{conv.title}</b>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="chip chip-idle">{projectName}</span>
            <span className={`chip ${chip.cls}`}>
              {chip.pulse && <span className="pulse" />}
              {chip.label}
            </span>
            {conv.tags.map((t) => (
              <span className="tag" key={t}>
                {t}
              </span>
            ))}
          </div>
        </div>
        <button className="btn" onClick={onClose} aria-label="Close chat">
          ✕ Close
        </button>
      </header>

      <div className="chat-body well" ref={bodyRef} data-testid="chat-body">
        {messages.map((m) =>
          m.role === 'system' ? (
            <div className="msg system" key={m.id}>
              — {m.text} —
            </div>
          ) : (
            <div className={`msg ${m.role}`} key={m.id}>
              <div>{m.text}</div>
              <div className="mtime mono" style={{ textTransform: 'none', letterSpacing: 0 }}>
                {new Date(m.ts).toLocaleTimeString([], { hour12: false })}
              </div>
            </div>
          ),
        )}
        {streamingText !== null && (
          <div className="msg bot" data-testid="streaming-msg">
            <div>
              {streamingText}
              <span className="pulse" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', marginLeft: 4 }} />
            </div>
          </div>
        )}
        {messages.length === 0 && streamingText === null && (
          <div className="empty-note">No messages yet in this conversation.</div>
        )}
      </div>

      {phase === 'degraded' && (
        <div className="strip" data-testid="degraded-strip">
          Degraded — lost capabilities: {lostCaps.length ? lostCaps.join(', ') : 'an optional observer'}.
          Sending still works.
        </div>
      )}
      {(phase === 'error' || phase === 'disconnected') && (
        <div className="strip error-strip" data-testid="gated-strip">
          {phase === 'error'
            ? `Connection error${status?.error?.actionHint ? ` — ${status.error.actionHint}` : ''}. Your draft is preserved.`
            : 'Disconnected — your draft is preserved. Reconnect from the adapter lamp, top right.'}
        </div>
      )}

      <div className="composer">
        <div className="well">
          <textarea
            value={draft}
            disabled={!canSend}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={canSend ? 'Message Kavi…' : `Composer unavailable — adapter is ${phase}`}
            aria-label="Message composer"
            data-testid="composer"
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 }}>
          <span className="small">
            via MockAdapter · phase: {phase}
            {snap.stale ? ' · stale' : ''}
          </span>
          <button
            className={`btn ${canSend ? 'btn-primary' : ''}`}
            onClick={onSend}
            disabled={draft.trim() === ''}
            data-testid="send-btn"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
