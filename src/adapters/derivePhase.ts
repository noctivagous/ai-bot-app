import type { AdapterCheck, AdapterPhase } from './types';

export type ChannelState = 'idle' | 'open' | 'closed';

/**
 * The one pure phase-derivation function (DESIGN.md §6.3), shared by every
 * adapter. Phase is never set ad hoc by adapter code.
 *
 * Derivation table (§6.3), with the precedence used here:
 *   channel 'idle' (connect() never called)                    → unconfigured
 *   any required check 'fail'                                  → error
 *   channel 'closed' (was connected; channel lost)             → disconnected
 *   any required check still 'pending' (connect in flight)     → connecting
 *   all required settled, any optional 'warn'/'fail'           → degraded
 *   all required settled, no optional 'warn'/'fail'            → ready
 *
 * A required check in state 'skip' counts as settled (not applicable to
 * this adapter) — it neither blocks 'ready' nor degrades. A check that
 * failed is more informative than a closed channel, so 'error' wins over
 * 'disconnected' when both would apply.
 */
export function derivePhase(checks: AdapterCheck[], channel: ChannelState): AdapterPhase {
  if (channel === 'idle') return 'unconfigured';

  const required = checks.filter((c) => c.required);
  const optional = checks.filter((c) => !c.required);

  if (required.some((c) => c.state === 'fail')) return 'error';
  if (channel === 'closed') return 'disconnected';
  if (required.some((c) => c.state === 'pending')) return 'connecting';
  if (optional.some((c) => c.state === 'warn' || c.state === 'fail')) return 'degraded';
  return 'ready';
}
