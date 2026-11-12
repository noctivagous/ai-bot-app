// records tests — transport selection with a mocked fetch (Q3: bridge
// hosts records; local fallback when unreachable). Each test builds a
// fresh module instance because bridge availability is module state.

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Rec {
  id: string;
  v?: number;
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('records bridge transport', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('falls back to local storage behaviour when the bridge is unreachable', async () => {
    const { createRecords } = await import('./records');
    const failing = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const r = createRecords(failing);
    await r.create<Rec>('c1', { id: 'a', v: 1 });
    await r.save<Rec>('c1', [{ id: 'a', v: 2 }]);
    await expect(r.list<Rec>('c1')).resolves.toEqual([{ id: 'a', v: 2 }]);
  });

  it('uses the bridge for list/create/save when /health answers', async () => {
    const { createRecords } = await import('./records');
    const store = new Map<string, Rec[]>();
    const calls: string[] = [];
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/health')) return jsonResponse({ ok: true });
      const m = url.match(/\/records\/(\w+)$/);
      const col = m![1]!;
      if ((init?.method ?? 'GET') === 'GET') return jsonResponse(store.get(col) ?? []);
      if (init?.method === 'POST') {
        const rec = JSON.parse(String(init.body)) as Rec;
        store.set(col, [...(store.get(col) ?? []), rec]);
        return jsonResponse(rec, true, 201);
      }
      if (init?.method === 'PUT') {
        store.set(col, JSON.parse(String(init.body)) as Rec[]);
        return jsonResponse({ ok: true });
      }
      throw new Error('unexpected');
    }) as unknown as typeof fetch;
    const r = createRecords(fakeFetch);
    await r.create<Rec>('md_projects', { id: 'p1' });
    await expect(r.list<Rec>('md_projects')).resolves.toEqual([{ id: 'p1' }]);
    await r.save<Rec>('md_projects', [{ id: 'p2' }]);
    expect(store.get('md_projects')).toEqual([{ id: 'p2' }]);
    expect(calls.some((c) => c.includes('/records/md_projects'))).toBe(true);
  });

  it('bridgeHttpBase derives the HTTP origin from ?bridge= and defaults to 7701', async () => {
    const { bridgeHttpBase } = await import('./records');
    expect(bridgeHttpBase('')).toBe('http://127.0.0.1:7701');
    expect(bridgeHttpBase('?bridge=ws://127.0.0.1:7701')).toBe('http://127.0.0.1:7701');
    expect(bridgeHttpBase('?bridge=ws://localhost:9999')).toBe('http://localhost:9999');
  });
});
