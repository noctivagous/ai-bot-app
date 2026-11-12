// Adapter registry (DESIGN.md §8.4). Resolves exactly one adapter from
// config. `?adapter=mock` is the default (the simulation the shell was
// built against); `?adapter=muse` constructs the real MuseAiAdapter
// against the local bridge — failures surface as that adapter's status
// (error in the popover), never as a silent fallback to the mock.

import { MockAdapter, type MockScenario, MOCK_SCENARIOS } from './MockAdapter';
import { MuseAiAdapter } from './MuseAiAdapter';
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

  if (which === 'muse' || which === 'muse-ai') {
    const bridgeUrl = params.get('bridge') ?? undefined;
    return { ok: true, adapter: new MuseAiAdapter(bridgeUrl ? { bridgeUrl } : {}) };
  }

  return { ok: false, error: `Unknown adapter “${which}”. Available: mock (default), muse.` };
}
