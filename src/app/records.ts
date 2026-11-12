// records stub (DESIGN.md §8.1). The seed prototype persisted through a
// webartifact host's `records.list` / `records.create` calls against named
// collections; a standalone app has no such host, so the same call shape is
// implemented here over localStorage, with an in-memory fallback when
// storage is unavailable. One module owns this, so no component changes
// when a real backend arrives (backend choice is Q3, §12 — it must not
// block this slice).
//
// `save()` is stub-internal: whole-collection replacement, used by the
// app's organisation store to persist edits (rename/file/tag). A real
// backend would offer per-record update; the stub keeps it simple and
// says so.

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

export const records: Records = {
  async list<T>(collection: string): Promise<T[]> {
    return readAll<T>(collection).map((r) => ({ ...(r as object) })) as T[];
  },

  async create<T extends { id: string }>(collection: string, record: T): Promise<T> {
    const all = readAll<T>(collection);
    all.push(record);
    writeAll(collection, all);
    return record;
  },

  async save<T>(collection: string, all: T[]): Promise<void> {
    writeAll(collection, all);
  },
};

/** Seed-on-first-load: if the collection is empty, write the seed and
 * return it; otherwise return what's stored. */
export async function loadCollection<T>(collection: string, seed: T[]): Promise<T[]> {
  const existing = await records.list<T>(collection);
  if (existing.length > 0) return existing;
  await records.save(collection, seed);
  return [...seed];
}
