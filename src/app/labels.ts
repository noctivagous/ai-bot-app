// User-facing labels for adapter internals (FEATURE-MAP R2/R5).
// Adapter capability keys and check states are wire vocabulary; the
// surface never prints them raw. Every place that shows a capability
// or a check state goes through this module, so the friendly name
// lives in exactly one place.

import type { AdapterCapabilities, CheckState } from '../adapters/types';

export const CAPABILITY_LABELS: Record<keyof AdapterCapabilities, string> = {
  streaming: 'Streaming replies',
  listBots: 'Bot list',
  approvals: 'Approvals',
  activity: 'Activity',
  surfaceActions: 'Control Panel actions',
  scheduleIntents: 'Schedule proposals',
  webviewIntents: 'Web view proposals',
};

/** Friendly name for a capability key; unknown keys pass through. */
export function capabilityLabel(key: string): string {
  return (CAPABILITY_LABELS as Record<string, string>)[key] ?? key;
}

/** Plain state words for check states (no mono shorthand). */
export const CHECK_STATE_WORDS: Record<CheckState, string> = {
  pass: 'Pass',
  warn: 'Warning',
  fail: 'Fail',
  pending: 'Pending',
  skip: 'Skipped',
};
