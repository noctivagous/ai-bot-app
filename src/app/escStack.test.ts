// @vitest-environment jsdom
// Escape stack (FEATURE-MAP R4): only the topmost open surface closes.

import { describe, expect, it } from 'vitest';
import { pushEscHandler } from './escStack';

function escapeKey(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

describe('escStack', () => {
  it('fires only the most recently pushed handler', () => {
    const calls: string[] = [];
    const popA = pushEscHandler(() => calls.push('a'));
    const popB = pushEscHandler(() => calls.push('b'));
    try {
      escapeKey();
      expect(calls).toEqual(['b']);
      escapeKey();
      expect(calls).toEqual(['b', 'b']);
    } finally {
      popB();
      popA();
    }
  });

  it('restores the previous handler when the top pops', () => {
    const calls: string[] = [];
    const popA = pushEscHandler(() => calls.push('a'));
    const popB = pushEscHandler(() => calls.push('b'));
    popB();
    try {
      escapeKey();
      expect(calls).toEqual(['a']);
    } finally {
      popA();
    }
  });

  it('ignores other keys, and goes quiet when the stack empties', () => {
    const calls: string[] = [];
    const pop = pushEscHandler(() => calls.push('x'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(calls).toEqual([]);
    pop();
    escapeKey();
    expect(calls).toEqual([]);
  });
});
