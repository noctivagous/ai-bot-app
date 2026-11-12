// Shared live-state + formatting helpers for the shell components.

import type { AdapterPhase } from '../adapters/types';
import type { ConversationRecord, ProjectStatus } from './seed';

/** Live state of a conversation, fed by adapter `activity` events (§2.10).
 * Running is a fact reported by the adapter — never inferred from which
 * chat happens to be open. */
export interface LiveState {
  state: 'running' | 'done' | 'failed';
  activity: string;
  /** Expandable "what is it doing" detail (ActivityPatch.detail, §2.10). */
  detail?: string;
  /** Set when the activity finished: what came of the work. */
  outcome?: string;
  title?: string;
  progress: number;
  elapsedSec: number;
}

export type LiveMap = Record<string, LiveState>;

/** A finished activity, kept for the Board's Recently Finished list —
 * project history, fed by `activity` events (transient data: held in app
 * state for the session, never written to the records store). */
export interface RecentFinish {
  conversationId: string;
  title: string;
  outcome?: string;
  detail?: string;
  at: number;
}

export interface ToastMsg {
  id: number;
  text: string;
  error?: boolean;
}

export function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function timeAgo(ts: number, now: number): string {
  const sec = Math.max(0, Math.round((now - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function phaseLamp(phase: AdapterPhase | null): string {
  switch (phase) {
    case 'ready':
      return 'on-green';
    case 'degraded':
    case 'connecting':
      return 'on-amber';
    case 'error':
      return 'on-red';
    default:
      return '';
  }
}

export function projectLamp(status: ProjectStatus): string {
  switch (status) {
    case 'active':
      return 'on-green';
    case 'awaiting-owner':
      return 'on-amber';
    case 'blocked':
      return 'on-red';
    case 'done':
      return 'on-blue';
    default:
      return '';
  }
}

export interface StateChip {
  label: string;
  cls: string;
  pulse: boolean;
}

export function conversationChip(conv: ConversationRecord, live?: LiveState): StateChip {
  if (live?.state === 'done') return { label: 'done — new', cls: 'chip-done', pulse: false };
  if (live?.state === 'running') return { label: 'running', cls: 'chip-running', pulse: true };
  switch (conv.status) {
    case 'waiting-on-owner':
      return { label: 'waiting on you', cls: 'chip-waiting', pulse: false };
    case 'waiting-on-bot':
      return { label: 'waiting on bot', cls: 'chip-waiting', pulse: false };
    case 'parked':
      return { label: 'parked', cls: 'chip-parked', pulse: false };
    case 'done':
      return { label: 'done', cls: 'chip-idle', pulse: false };
    default:
      return { label: 'idle', cls: 'chip-idle', pulse: false };
  }
}
