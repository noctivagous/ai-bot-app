import type { Scheduler } from './MockAdapter';

/** Deterministic scheduler for tests: timers fire only when advance()
 * moves the clock. Shared by the adapter test suites. */
export class FakeScheduler implements Scheduler {
  private t = 1_000_000;
  private nextId = 1;
  private timers = new Map<number, { fn: () => void; at: number; interval?: number }>();

  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { fn, at: this.t + ms });
    return id;
  }
  clearTimeout(h: unknown): void {
    this.timers.delete(h as number);
  }
  setInterval(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { fn, at: this.t + ms, interval: ms });
    return id;
  }
  clearInterval(h: unknown): void {
    this.timers.delete(h as number);
  }
  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      let next: [number, { fn: () => void; at: number; interval?: number }] | undefined;
      for (const entry of this.timers) {
        if (entry[1].at <= end && (!next || entry[1].at < next[1].at)) next = entry;
      }
      if (!next) break;
      const [id, timer] = next;
      this.t = timer.at;
      if (timer.interval) timer.at = this.t + timer.interval;
      else this.timers.delete(id);
      timer.fn();
    }
    this.t = end;
  }
}
