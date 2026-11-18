import { describe, expect, it } from 'vitest';
import { isDemoMode } from './demoMode';

describe('isDemoMode', () => {
  it('is on when the build baked VITE_MD_DEMO=1', () => {
    expect(isDemoMode('', '1')).toBe(true);
    expect(isDemoMode('?adapter=muse', '1')).toBe(true);
  });

  it('is on for ?demo=1 without the build flag', () => {
    expect(isDemoMode('?demo=1', undefined)).toBe(true);
  });

  it('is off otherwise', () => {
    expect(isDemoMode('', undefined)).toBe(false);
    expect(isDemoMode('?adapter=muse', undefined)).toBe(false);
    expect(isDemoMode('?demo=0', undefined)).toBe(false);
    expect(isDemoMode('?demo=1', '0')).toBe(true); // URL flag works on any build
  });
});
