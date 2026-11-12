// Amend application — FEATURE-MAP D4 follow-up (decided 2026-11-12).
//
// A `message.bot.amend` event mutates a bot message AFTER its final
// (today: stamping `interrupted` when the client's Activity entry for
// that reply concludes "Interrupted" — a verdict that cannot ride the
// final itself, because the final is settle-driven and the verdict
// belongs to a different page surface). The store's rules, exactly:
//
//   - amend after the final  → the delivered message is stamped in place.
//   - amend before the final → the amend is buffered by message id and
//     stamped onto the final as it lands (finals stay exactly-once).
//   - amend for a message that never lands → dropped silently. The
//     buffer is bounded (oldest evicted), so a stream of stray amends
//     cannot grow it without limit.
//   - duplicate amends are idempotent: stamping a message that already
//     carries the amended value returns the list untouched.
//
// App.tsx drives this class from its event handler; the class itself
// is pure bookkeeping over ChatMsg lists, so the rules are unit-tested
// here without rendering the app.

import type { ChatMsg } from '../adapters/types';

export interface AmendPatch {
  interrupted: boolean;
}

/** Upper bound on buffered (pre-final) amends. */
export const MAX_PENDING_AMENDS = 100;

function withPatch(msg: ChatMsg, patch: AmendPatch): ChatMsg {
  if (!!msg.interrupted === patch.interrupted) return msg;
  if (patch.interrupted) return { ...msg, interrupted: true };
  const next = { ...msg };
  delete next.interrupted;
  return next;
}

/** Stamp one message in a list. Returns the list to store — the SAME
 * reference when the message already carries the amended value — or
 * null when no message with `msgId` is in the list. */
export function stampChatMsg(list: ChatMsg[], msgId: string, patch: AmendPatch): ChatMsg[] | null {
  const idx = list.findIndex((m) => m.id === msgId);
  if (idx < 0) return null;
  const stamped = withPatch(list[idx]!, patch);
  if (stamped === list[idx]) return list;
  const next = list.slice();
  next[idx] = stamped;
  return next;
}

export class AmendBook {
  private pending = new Map<string, AmendPatch>();

  get pendingCount(): number {
    return this.pending.size;
  }

  private key(convId: string, msgId: string): string {
    return `${convId}\n${msgId}`;
  }

  /** Apply an amend to a conversation's message list. Returns the list
   * to store (possibly the same reference), or null when the message
   * is not there yet — in which case the amend has been buffered for
   * the final, and the caller stores nothing. */
  applyToList(
    list: ChatMsg[] | undefined,
    convId: string,
    msgId: string,
    patch: AmendPatch,
  ): ChatMsg[] | null {
    if (list) {
      const stamped = stampChatMsg(list, msgId, patch);
      if (stamped) return stamped;
    }
    this.buffer(convId, msgId, patch);
    return null;
  }

  /** Consult the buffer for an incoming message (a final landing):
   * returns the message stamped if an amend was waiting for it, the
   * message unchanged otherwise. Consumes the buffered amend. */
  stampIncoming(convId: string, msg: ChatMsg): ChatMsg {
    const k = this.key(convId, msg.id);
    const patch = this.pending.get(k);
    if (!patch) return msg;
    this.pending.delete(k);
    return withPatch(msg, patch);
  }

  private buffer(convId: string, msgId: string, patch: AmendPatch): void {
    const k = this.key(convId, msgId);
    if (!this.pending.has(k) && this.pending.size >= MAX_PENDING_AMENDS) {
      // Bounded: evict the oldest buffered amend — it is the one whose
      // final is least likely still to land.
      const oldest = this.pending.keys().next().value;
      if (oldest !== undefined) this.pending.delete(oldest);
    }
    this.pending.set(k, patch);
  }
}
