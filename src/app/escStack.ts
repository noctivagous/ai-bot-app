// Escape-key stack (FEATURE-MAP R4 — dialog behaviour).
//
// Several surfaces can be open at once (chat slide-over, artifact
// viewer above it, connection popover above both). Escape must close
// only the TOPMOST one. Each surface pushes a handler on mount and
// pops it on unmount; mount order in this app is stacking order (a
// later sibling paints above an earlier one), so the last pushed
// handler is the visible top. One document listener serves the stack.

import { useEffect, useRef } from 'react';

type EscHandler = () => void;

const stack: EscHandler[] = [];
let listening = false;

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  const top = stack[stack.length - 1];
  if (top) {
    e.preventDefault();
    top();
  }
}

/** Push a handler; returns the pop function. */
export function pushEscHandler(fn: EscHandler): () => void {
  stack.push(fn);
  if (!listening) {
    listening = true;
    document.addEventListener('keydown', onKeyDown);
  }
  return () => {
    const i = stack.indexOf(fn);
    if (i >= 0) stack.splice(i, 1);
    if (stack.length === 0 && listening) {
      listening = false;
      document.removeEventListener('keydown', onKeyDown);
    }
  };
}

/** Register `onClose` as this surface's Escape handler while mounted. */
export function useEscClose(onClose: () => void): void {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => pushEscHandler(() => ref.current()), []);
}
