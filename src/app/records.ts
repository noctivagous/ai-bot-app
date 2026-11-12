// Records (DESIGN.md §8.1 + Q3 as decided in §12: the BRIDGE hosts
// records). The seed prototype persisted through a webartifact host's
// `records.list` / `records.create` calls against named collections; this
// module keeps that exact call shape with two transports:
//
//   1. Bridge transport (preferred): fetch against the local bridge's
//      /records/:collection endpoints. The bridge persists to
//      bridge/data/records.json, so organisation survives browser
//      profile changes and is shared by any app instance on the machine.
//   2. Local fallback: localStorage (in-memory when storage is
//      unavailable) — the slice 0–1 stub behaviour, used whenever the
//      bridge is unreachable, so the app works fully offline.
//
// The bridge URL follows the page's ?bridge= WebSocket URL (same host),
// defaulting to http://127.0.0.1:7701. The bridge transport only engages
// when the real adapter is in play (?adapter=muse): in mock mode the
// bridge is not part of the setup, and probing for it would spam the
// console with refused fetches for no benefit. Availability is probed
// via /health (one in-flight probe shared by concurrent callers) and
// re-probed at most every 3 s while down; a mid-session bridge failure
// flips back to local rather than losing a write. When the bridge is
// reachable it is authoritative (Q3) — collections are NOT merged with
// local leftovers.
//
// `save()` is whole-collection replacement, used by the app's
// organisation store to persist edits (rename/file/tag).

export interface Records {
  list<T>(collection: string): Promise<T[]>;
  create<T extends { id: string }>(collection: string, record: T): Promise<T>;
  save<T>(collection: string, records: T[]): Promise<void>;
}

const PREFIX = 'missiondesk:';

const memory = new Map<string, unknown[]>();

function storageAvailable(): boolean {
  try {
    const k = `${PREFIX}__probe`;
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

const useStorage = storageAvailable();

function readAll<T>(collection: string): T[] {
  if (useStorage) {
    try {
      const raw = localStorage.getItem(PREFIX + collection);
      if (raw) return JSON.parse(raw) as T[];
    } catch {
      // fall through to memory
    }
  }
  return (memory.get(collection) as T[] | undefined) ?? [];
}

function writeAll<T>(collection: string, records: T[]): void {
  memory.set(collection, records as unknown[]);
  if (useStorage) {
    try {
      localStorage.setItem(PREFIX + collection, JSON.stringify(records));
    } catch {
      // storage full/blocked — memory copy still serves the session
    }
  }
}

// ---- bridge transport ----

export function bridgeHttpBase(search: string): string {
  try {
    const ws = new URLSearchParams(search).get('bridge');
    if (ws) {
      const u = new URL(ws);
      return `http://${u.hostname}:${u.port || '7701'}`;
    }
  } catch {
    // malformed ?bridge= — fall through to the default
  }
  return 'http://127.0.0.1:7701';
}

const BRIDGE_BASE =
  typeof window !== 'undefined' ? bridgeHttpBase(window.location.search) : 'http://127.0.0.1:7701';

const BRIDGE_EXPECTED =
  typeof window === 'undefined'
    ? true // non-browser (tests): the injected fetch decides
    : ['muse', 'muse-ai'].includes(new URLSearchParams(window.location.search).get('adapter') ?? '');

let bridgeState: 'unknown' | 'up' | 'down' = 'unknown';
let lastProbeAt = 0;
let probeInFlight: Promise<boolean> | null = null;

async function bridgeUp(fetchImpl: typeof fetch): Promise<boolean> {
  if (!BRIDGE_EXPECTED) return false;
  const now = Date.now();
  if (bridgeState === 'up') return true;
  if (bridgeState === 'down' && now - lastProbeAt < 3000) return false;
  if (probeInFlight) return probeInFlight;
  lastProbeAt = now;
  probeInFlight = (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 700);
      const res = await fetchImpl(`${BRIDGE_BASE}/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      bridgeState = res.ok ? 'up' : 'down';
    } catch {
      bridgeState = 'down';
    } finally {
      probeInFlight = null;
    }
    return bridgeState === 'up';
  })();
  return probeInFlight;
}

async function bridgeFetch<T>(
  fetchImpl: typeof fetch,
  path: string,
  init?: RequestInit,
): Promise<T | undefined> {
  try {
    const res = await fetchImpl(`${BRIDGE_BASE}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`bridge ${res.status}`);
    return (await res.json()) as T;
  } catch {
    // Bridge died mid-session: fall back locally from the next call on.
    bridgeState = 'down';
    lastProbeAt = Date.now();
    return undefined;
  }
}

/** Builds a Records implementation over a given fetch (tests inject one;
 * the app uses the global). Transport selection is per call. */
export function createRecords(fetchImpl: typeof fetch): Records {
  return {
    async list<T>(collection: string): Promise<T[]> {
      if (await bridgeUp(fetchImpl)) {
        const remote = await bridgeFetch<T[]>(fetchImpl, `/records/${collection}`);
        if (remote) return remote.map((r) => ({ ...(r as object) })) as T[];
      }
      return readAll<T>(collection).map((r) => ({ ...(r as object) })) as T[];
    },

    async create<T extends { id: string }>(collection: string, record: T): Promise<T> {
      if (await bridgeUp(fetchImpl)) {
        const saved = await bridgeFetch<T>(fetchImpl, `/records/${collection}`, {
          method: 'POST',
          body: JSON.stringify(record),
        });
        if (saved) return saved;
      }
      const all = readAll<T>(collection);
      all.push(record);
      writeAll(collection, all);
      return record;
    },

    async save<T>(collection: string, all: T[]): Promise<void> {
      if (await bridgeUp(fetchImpl)) {
        const ok = await bridgeFetch<{ ok: boolean }>(fetchImpl, `/records/${collection}`, {
          method: 'PUT',
          body: JSON.stringify(all),
        });
        if (ok) return;
      }
      writeAll(collection, all);
    },
  };
}

export const records: Records = createRecords(
  typeof fetch !== 'undefined' ? fetch.bind(globalThis) : (async () => { throw new Error('no fetch'); }) as typeof fetch,
);

/** Seed-on-first-load: if the collection is empty, write the seed and
 * return it; otherwise return what's stored. */
export async function loadCollection<T>(collection: string, seed: T[]): Promise<T[]> {
  const existing = await records.list<T>(collection);
  if (existing.length > 0) return existing;
  await records.save(collection, seed);
  return [...seed];
}
