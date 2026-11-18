import { describe, expect, it } from 'vitest';
import { resolveAdapter } from './registry';
import { MockAdapter } from './MockAdapter';
import { MuseAiAdapter } from './MuseAiAdapter';

describe('resolveAdapter', () => {
  it('defaults to the mock adapter', () => {
    const r = resolveAdapter('');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.adapter).toBeInstanceOf(MockAdapter);
  });

  it('selects the real adapter for ?adapter=muse outside demo mode', () => {
    const r = resolveAdapter('?adapter=muse');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.adapter).toBeInstanceOf(MuseAiAdapter);
  });

  it('demo mode locks to the mock even when ?adapter=muse is requested', () => {
    const r = resolveAdapter('?demo=1&adapter=muse');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.adapter).toBeInstanceOf(MockAdapter);
  });

  it('rejects unknown adapter names', () => {
    const r = resolveAdapter('?adapter=nope');
    expect(r.ok).toBe(false);
  });
});
