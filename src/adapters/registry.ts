// Adapter registry (DESIGN.md §8.4). Resolves exactly one adapter from
// config. `?adapter=mock` is the default and, in this slice, the only value
// that resolves; `muse-ai` resolves to an honest construction error —
// never a silent fallback to the mock.

import { MockAdapter, type MockScenario, MOCK_SCENARIOS } from './MockAdapter';
import type { BotServiceAdapter } from './types';

export type RegistryResult =
  | { ok: true; adapter: BotServiceAdapter; mock?: MockAdapter }
  | { ok: false; error: string };

export function resolveAdapter(search: string): RegistryResult {
  const params = new URLSearchParams(search);
  const which = params.get('adapter') ?? 'mock';

  if (which === 'mock') {
    const scenarioParam = params.get('mockScenario');
    const scenario: MockScenario = MOCK_SCENARIOS.includes(scenarioParam as MockScenario)
      ? (scenarioParam as MockScenario)
      : 'happy';
    const mock = new MockAdapter({ scenario });
    return { ok: true, adapter: mock, mock };
  }

  if (which === 'muse-ai') {
    return {
      ok: false,
      error:
        'The Muse AI adapter is not built yet. It arrives in slice 3 (bridge + extension health) — see DESIGN.md §9/§11. The mock remains available at ?adapter=mock.',
    };
  }

  return { ok: false, error: `Unknown adapter “${which}”. Available in this slice: mock.` };
}
