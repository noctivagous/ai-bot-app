// Resources registry (DESIGN.md §10) — the SECOND plug-in kind, beside
// the adapter registry: global resource modules that exist independently
// of any one bot service and connect to individual bots. Where adapters
// plug in *services that host bots*, resources plug in *things bots can
// use*: monitors, mail accounts, databases.
//
// HONEST SCOPE (slice 7): this tranche is the registry, the seed modules,
// per-bot connect toggles, and counts — nothing more. There are NO data
// flows behind these modules yet: connecting one does not make mail or
// monitor data appear anywhere. Data flows are a later tranche (§2.12
// notes Muse's own monitors as one future source). The panel says the
// same thing in the UI; this comment says it in the code.

export type ResourceKind = 'monitor' | 'email' | 'database';

export interface ResourceModule {
  id: string;
  kind: ResourceKind;
  name: string;
  detail: string;
}

/** Seed modules: Monitor Modules ×4, Email Accounts ×2, Databases ×1. */
export const RESOURCE_MODULES: ResourceModule[] = [
  { id: 'mon-prices', kind: 'monitor', name: 'Price watch', detail: 'Watches product prices and alerts on change.' },
  { id: 'mon-weather', kind: 'monitor', name: 'Weather watch', detail: 'Watches conditions for places that matter.' },
  { id: 'mon-pages', kind: 'monitor', name: 'Page change watch', detail: 'Watches web pages for meaningful edits.' },
  { id: 'mon-schedule', kind: 'monitor', name: 'Schedule watch', detail: 'Watches for schedule and availability changes.' },
  { id: 'mail-personal', kind: 'email', name: 'Personal mailbox', detail: 'The owner’s personal email account.' },
  { id: 'mail-muse', kind: 'email', name: 'Muse mailbox (noct@muse.ai)', detail: 'Kavi’s own Muse Mail address.' },
  { id: 'db-records', kind: 'database', name: 'App records database', detail: 'The organisation records the bridge hosts (Q3).' },
];

export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  monitor: 'Monitor Modules',
  email: 'Email Accounts',
  database: 'Databases',
};

/** One bot's connection to one module. Persisted via records
 * (collection md_resources) as a flat list of these. */
export interface ResourceConnection {
  moduleId: string;
  botId: string;
  connected: boolean;
}

export function countByKind(modules: ResourceModule[]): Record<ResourceKind, number> {
  const counts: Record<ResourceKind, number> = { monitor: 0, email: 0, database: 0 };
  for (const m of modules) counts[m.kind] += 1;
  return counts;
}

export function isConnected(
  connections: ResourceConnection[],
  moduleId: string,
  botId: string,
): boolean {
  return connections.some((c) => c.moduleId === moduleId && c.botId === botId && c.connected);
}

export function withConnection(
  connections: ResourceConnection[],
  moduleId: string,
  botId: string,
  connected: boolean,
): ResourceConnection[] {
  const rest = connections.filter((c) => !(c.moduleId === moduleId && c.botId === botId));
  return [...rest, { moduleId, botId, connected }];
}
