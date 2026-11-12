import { describe, it, expect } from 'vitest';
import {
  RESOURCE_MODULES,
  countByKind,
  isConnected,
  withConnection,
  type ResourceConnection,
} from './resources';

describe('resources registry (§10, second plug-in kind)', () => {
  it('seeds Monitor Modules ×4, Email Accounts ×2, Databases ×1', () => {
    expect(RESOURCE_MODULES).toHaveLength(7);
    expect(countByKind(RESOURCE_MODULES)).toEqual({ monitor: 4, email: 2, database: 1 });
    expect(new Set(RESOURCE_MODULES.map((m) => m.id)).size).toBe(7);
  });

  it('connection toggles are per-bot and replace rather than duplicate', () => {
    let conns: ResourceConnection[] = [];
    expect(isConnected(conns, 'mon-prices', 'kavi')).toBe(false);
    conns = withConnection(conns, 'mon-prices', 'kavi', true);
    expect(isConnected(conns, 'mon-prices', 'kavi')).toBe(true);
    expect(isConnected(conns, 'mon-prices', 'other-bot')).toBe(false);
    conns = withConnection(conns, 'mon-prices', 'kavi', false);
    expect(conns).toHaveLength(1);
    expect(isConnected(conns, 'mon-prices', 'kavi')).toBe(false);
  });
});
