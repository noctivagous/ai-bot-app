// D4 follow-up: the amend path (FEATURE-MAP D4). These tests drive
// AmendBook exactly as App.tsx's event handler does: applyToList for
// an incoming amend, stampIncoming for every message as it lands.

import { describe, expect, it } from 'vitest';
import type { ChatMsg } from '../adapters/types';
import { AmendBook, MAX_PENDING_AMENDS, stampChatMsg } from './amends';

const INTERRUPTED = { interrupted: true } as const;

function botMsg(id: string, extra: Partial<ChatMsg> = {}): ChatMsg {
  return { id, role: 'bot', text: `text of ${id}`, ts: 't', ...extra };
}

describe('D4 amend application (AmendBook)', () => {
  it('amend after the final stamps the delivered message', () => {
    const book = new AmendBook();
    const list = [botMsg('m1'), botMsg('m2')];
    const next = book.applyToList(list, 'conv-a', 'm1', INTERRUPTED);
    expect(next).not.toBeNull();
    expect(next!.find((m) => m.id === 'm1')!.interrupted).toBe(true);
    expect(next!.find((m) => m.id === 'm2')!.interrupted).toBeUndefined();
    expect(book.pendingCount).toBe(0); // nothing buffered — it applied
  });

  it('amend before the final is buffered and stamps the final as it lands', () => {
    const book = new AmendBook();
    const applied = book.applyToList([botMsg('m0')], 'conv-a', 'm9', INTERRUPTED);
    expect(applied).toBeNull(); // m9 not in the list yet → buffered
    expect(book.pendingCount).toBe(1);

    const landed = book.stampIncoming('conv-a', botMsg('m9'));
    expect(landed.interrupted).toBe(true);
    expect(book.pendingCount).toBe(0); // consumed
  });

  it('an amend for a message that never lands is dropped, and the buffer is bounded', () => {
    const book = new AmendBook();
    for (let i = 0; i < MAX_PENDING_AMENDS + 25; i++) {
      book.applyToList([], 'conv-a', `ghost-${i}`, INTERRUPTED);
    }
    expect(book.pendingCount).toBe(MAX_PENDING_AMENDS);
    // The oldest ghosts were evicted: a final landing under an evicted
    // id arrives unstamped; a recent one still stamps.
    expect(book.stampIncoming('conv-a', botMsg('ghost-0')).interrupted).toBeUndefined();
    expect(
      book.stampIncoming('conv-a', botMsg(`ghost-${MAX_PENDING_AMENDS + 24}`)).interrupted,
    ).toBe(true);
    // And a message that was never amended is untouched.
    expect(book.stampIncoming('conv-a', botMsg('unrelated')).interrupted).toBeUndefined();
  });

  it('buffered amends are scoped to their conversation', () => {
    const book = new AmendBook();
    book.applyToList([], 'conv-a', 'm1', INTERRUPTED);
    // Same message id landing in a DIFFERENT conversation must not
    // pick up conv-a's amend.
    expect(book.stampIncoming('conv-b', botMsg('m1')).interrupted).toBeUndefined();
    expect(book.pendingCount).toBe(1);
    expect(book.stampIncoming('conv-a', botMsg('m1')).interrupted).toBe(true);
  });

  it('duplicate amends are harmless', () => {
    const book = new AmendBook();
    const list = [botMsg('m1')];
    const once = book.applyToList(list, 'conv-a', 'm1', INTERRUPTED)!;
    const twice = book.applyToList(once, 'conv-a', 'm1', INTERRUPTED)!;
    expect(twice).toBe(once); // already stamped — same list, no churn
    expect(twice[0]!.interrupted).toBe(true);

    // Duplicate pre-final amends collapse into one buffered entry.
    const book2 = new AmendBook();
    book2.applyToList([], 'conv-a', 'm2', INTERRUPTED);
    book2.applyToList([], 'conv-a', 'm2', INTERRUPTED);
    expect(book2.pendingCount).toBe(1);
    const landed = book2.stampIncoming('conv-a', botMsg('m2'));
    expect(landed.interrupted).toBe(true);
    // A second "landing" of the same id finds nothing buffered.
    expect(book2.stampIncoming('conv-a', botMsg('m2')).interrupted).toBeUndefined();
  });

  it('an amend can clear the flag again (patch is a value, not a latch)', () => {
    const stamped = stampChatMsg([botMsg('m1', { interrupted: true })], 'm1', {
      interrupted: false,
    })!;
    expect(stamped[0]!.interrupted).toBeUndefined();
    expect('interrupted' in stamped[0]!).toBe(false);
  });
});
