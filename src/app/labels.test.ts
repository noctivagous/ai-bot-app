// Friendly-name map (FEATURE-MAP R5): the surface never prints raw
// adapter wire vocabulary. Pure functions — node environment is fine.

import { describe, expect, it } from 'vitest';
import { CAPABILITY_LABELS, CHECK_STATE_WORDS, capabilityLabel } from './labels';
import type { AdapterCapabilities } from '../adapters/types';

describe('capabilityLabel', () => {
  it('labels every AdapterCapabilities key with a user-facing name', () => {
    const keys: Array<keyof AdapterCapabilities> = [
      'streaming',
      'listBots',
      'approvals',
      'activity',
      'surfaceActions',
      'scheduleIntents',
      'webviewIntents',
    ];
    for (const k of keys) {
      expect(CAPABILITY_LABELS[k], k).toBeTruthy();
      expect(capabilityLabel(k)).toBe(CAPABILITY_LABELS[k]);
      // A friendly name is words, not the camelCase wire key.
      expect(capabilityLabel(k)).not.toBe(k);
    }
    expect(capabilityLabel('activity')).toBe('Activity');
    expect(capabilityLabel('surfaceActions')).toBe('Control Panel actions');
  });

  it('passes unknown keys through unchanged (never hides a capability)', () => {
    expect(capabilityLabel('someFutureKey')).toBe('someFutureKey');
  });
});

describe('CHECK_STATE_WORDS', () => {
  it('gives every check state a plain word', () => {
    expect(CHECK_STATE_WORDS).toEqual({
      pass: 'Pass',
      warn: 'Warning',
      fail: 'Fail',
      pending: 'Pending',
      skip: 'Skipped',
    });
  });
});
