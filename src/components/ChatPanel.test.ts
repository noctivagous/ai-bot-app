// ChatPanel render contract (server-rendered; no DOM needed).
// Covers the two decided refinements that live in this component:
//  D1 (FEATURE-MAP S4) — Send materialises on text: with the phase
//    gating sends (here: no adapter snapshot, phase 'unconfigured') no
//    Send button renders even with a non-empty draft; the ready-phase
//    materialise-on-type behaviour is covered by the driven probe
//    (scripts/probe-refinements.mjs), which can drive the real store.
//  D4 (FEATURE-MAP S5) — an interrupted bot final renders the
//    "Interrupted" marker chip; normal finals never do.

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ChatPanel } from './ChatPanel';
import type { ChatMsg } from '../adapters/types';
import type { ConversationRecord } from '../app/seed';

const conv: ConversationRecord = {
  id: 'conv-main',
  title: 'Main chat',
  projectId: null,
  tags: [],
  status: 'active',
  goal: '',
  pinned: false,
  archived: false,
  lastActivityAt: 0,
};

const noop = (): void => {};

function render(messages: ChatMsg[], draft = ''): string {
  return renderToString(
    createElement(ChatPanel, {
      conv,
      projectName: 'Unfiled',
      messages,
      streamingText: null,
      draft,
      onDraftChange: noop,
      onSend: noop,
      onClose: noop,
    }),
  );
}

const botMsg = (id: string, text: string, extra: Partial<ChatMsg> = {}): ChatMsg => ({
  id,
  role: 'bot',
  text,
  ts: '2026-11-12T15:00:00.000Z',
  ...extra,
});

describe('ChatPanel — D1 send materialisation (gated side)', () => {
  it('renders no Send button with an empty draft', () => {
    expect(render([], '')).not.toContain('send-btn');
  });

  it('renders no Send button with a draft while the phase gates sending', () => {
    // A preserved draft in a gated phase (error/disconnected story) must
    // not resurrect the button — Send simply does not render (D1).
    expect(render([], 'a preserved draft')).not.toContain('send-btn');
  });
});

describe('ChatPanel — D4 interrupted marker', () => {
  it('marks an interrupted bot final with the Interrupted chip, once', () => {
    const html = render([
      botMsg('b1', 'The full answer that was on its way: the summar', { interrupted: true }),
      botMsg('b2', 'A complete reply.'),
    ]);
    expect(html).toContain('interrupted-marker');
    expect(html.match(/interrupted-marker/g)).toHaveLength(1);
    expect(html).toContain('Interrupted');
  });

  it('shows no marker when every final is normal', () => {
    const html = render([botMsg('b1', 'One reply.'), botMsg('b2', 'Another complete reply.')]);
    expect(html).not.toContain('interrupted-marker');
    expect(html).not.toContain('Interrupted');
  });

  it('never marks a user message, even if a flag were present', () => {
    const html = render([
      { id: 'u1', role: 'user', text: 'my own words', ts: '2026-11-12T15:00:00.000Z', interrupted: true },
    ]);
    expect(html).not.toContain('interrupted-marker');
  });
});
