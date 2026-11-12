// Adapter status store (DESIGN.md §8.4 / §6.5). Subscribes to the active
// adapter's onStatus, keeps the latest snapshot (dropping any with a lower
// seq), a ~100-entry in-memory transition ring buffer, and a 1 s tick so
// staleness and relative times re-render without adapter traffic.
//
// Status is ephemeral by design (§6.5): it lives here only — never in the
// records store, never persisted.

import { resolveAdapter } from '../adapters/registry';
import type { MockAdapter } from '../adapters/MockAdapter';
import type { AdapterStatus, BotEvent, BotServiceAdapter } from '../adapters/types';

export interface TransitionEntry {
  at: number;
  text: string;
}

export interface AdapterStoreSnapshot {
  status: AdapterStatus | null;
  constructionError: string | null;
  transitions: TransitionEntry[];
  now: number;
  stale: boolean;
}

const STALE_AFTER_MS = 15_000;
const RING_MAX = 100;

class AdapterStore {
  private adapter: BotServiceAdapter | null = null;
  private mock: MockAdapter | null = null;
  private constructionError: string | null = null;
  private status: AdapterStatus | null = null;
  private transitions: TransitionEntry[] = [];
  private listeners = new Set<() => void>();
  private snapshot: AdapterStoreSnapshot;
  private eventListeners = new Set<(e: BotEvent) => void>();
  private started = false;

  constructor() {
    this.snapshot = this.freshSnapshot(Date.now());
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const result = resolveAdapter(window.location.search);
    if (!result.ok) {
      this.constructionError = result.error;
      this.publish();
      return;
    }
    this.adapter = result.adapter;
    this.mock = result.mock ?? null;
    this.adapter.onStatus((s) => this.acceptStatus(s));
    this.adapter.onEvent((e) => {
      for (const fn of [...this.eventListeners]) fn(e);
    });
    // The 1 s tick (§8.4): drives staleness + relative-time rendering.
    setInterval(() => this.publish(), 1000);
    void this.adapter.connect();
  }

  getAdapter(): BotServiceAdapter | null {
    return this.adapter;
  }

  getMock(): MockAdapter | null {
    return this.mock;
  }

  async reconnect(): Promise<void> {
    if (!this.adapter) return;
    await this.adapter.disconnect();
    await this.adapter.connect();
  }

  onEvent(fn: (e: BotEvent) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): AdapterStoreSnapshot => this.snapshot;

  private acceptStatus(next: AdapterStatus): void {
    // Drop snapshots older than the one we hold (§8.4).
    if (this.status && next.seq < this.status.seq) return;
    this.logTransitions(this.status, next);
    this.status = next;
    this.publish();
  }

  private logTransitions(prev: AdapterStatus | null, next: AdapterStatus): void {
    const at = Date.now();
    if (!prev) {
      this.pushTransition(at, `phase → ${next.phase}`);
    } else if (prev.phase !== next.phase) {
      this.pushTransition(at, `phase ${prev.phase} → ${next.phase}`);
    }
    const prevChecks = new Map((prev?.checks ?? []).map((c) => [c.id, c]));
    for (const c of next.checks) {
      const p = prevChecks.get(c.id);
      if (p && (p.state !== c.state || p.detail !== c.detail)) {
        const detail = c.detail ? ` — ${c.detail}` : '';
        this.pushTransition(at, `${c.id}: ${p.state} → ${c.state}${detail}`);
      }
    }
  }

  private pushTransition(at: number, text: string): void {
    this.transitions = [...this.transitions.slice(-(RING_MAX - 1)), { at, text }];
  }

  private freshSnapshot(now: number): AdapterStoreSnapshot {
    const s = this.status;
    // §6.5 names ready/degraded (where a stale snapshot is dangerous
    // because it still looks alive); the marker is computed for
    // 'disconnected' too — §8.6's driven check expects it there, and
    // "no heartbeat for Xs" is exactly what the user needs to see.
    const stale =
      !!s &&
      (s.phase === 'ready' || s.phase === 'degraded' || s.phase === 'disconnected') &&
      s.lastEventAt !== undefined &&
      now - s.lastEventAt > STALE_AFTER_MS;
    return {
      status: s,
      constructionError: this.constructionError,
      transitions: this.transitions,
      now,
      stale,
    };
  }

  private publish(): void {
    this.snapshot = this.freshSnapshot(Date.now());
    for (const fn of [...this.listeners]) fn();
  }
}

export const adapterStore = new AdapterStore();
