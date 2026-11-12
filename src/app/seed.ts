// Seed data for the app's own organisation store (DESIGN.md §2.5/§2.8: the
// app's store holds only organisation — projects, statuses, links — never a
// second memory of bot content). Loaded into the records stub on first use
// (seed-on-first-load); afterwards the stored records win.
//
// Conversations and messages the *adapter* reports live in MockAdapter; the
// records below are the app-side filing for those conversations (same ids).

import type { ChatMsg } from '../adapters/types';

export type ProjectKind = 'software' | 'book' | 'research' | 'general';
export type ProjectStatus = 'active' | 'awaiting-owner' | 'blocked' | 'parked' | 'done';

export interface Project {
  id: string;
  name: string;
  kind: ProjectKind;
  status: ProjectStatus;
  nextAction: string;
}

export type ConversationStatus =
  | 'active'
  | 'waiting-on-owner'
  | 'waiting-on-bot'
  | 'parked'
  | 'done';

export interface ConversationRecord {
  id: string;
  title: string;
  projectId: string | null; // null = unfiled (Inbox tray, §2.8)
  tags: string[];
  status: ConversationStatus;
  goal: string;
  pinned: boolean;
  archived: boolean;
  lastActivityAt: number; // epoch ms
  proposedTitle?: string; // bot-proposed retitle (§2.9: accept/reject, never auto-applied)
}

export interface ScheduleItem {
  id: string;
  title: string;
  projectId: string | null;
  dayOffset: number; // 0 = today … 6
  startHour: number; // 0–23
  spanHours: number;
  awaitingOwner?: boolean;
}

export interface AppEvent {
  id: string;
  kind: string;
  label: string;
  ts: number;
  refId?: string;
}

export interface ArtifactItem {
  id: string;
  name: string;
  kind: string;
  description: string;
  provenance: { bot: string; chat: string; project: string; goal: string };
}

const HOUR = 3600_000;
const now = Date.now();

export const SEED_PROJECTS: Project[] = [
  { id: 'proj-ale', name: 'AI Live Editor', kind: 'software', status: 'awaiting-owner', nextAction: 'Owner to decide push of slices 5–11' },
  { id: 'proj-nibglider', name: 'NibGlider', kind: 'software', status: 'active', nextAction: 'Panel coverage follow-up after layout fix' },
  { id: 'proj-ai-bot-app', name: 'ai-bot-app', kind: 'software', status: 'active', nextAction: 'Judge Mission Desk slices 0–1' },
  { id: 'proj-ansci', name: 'AnSci', kind: 'research', status: 'active', nextAction: 'Review CSKG transcript batch' },
  { id: 'proj-strokecore', name: 'StrokeCore', kind: 'software', status: 'parked', nextAction: 'Resume Textura construction' },
  { id: 'proj-chinese', name: 'Chinese Book', kind: 'book', status: 'active', nextAction: 'Numbers chapter session' },
];

export const SEED_CONVERSATIONS: ConversationRecord[] = [
  { id: 'conv-main', title: 'Main chat', projectId: null, tags: [], status: 'active', goal: '—', pinned: true, archived: false, lastActivityAt: now - 2 * HOUR },
  { id: 'conv-ai-bot-app', title: 'Build Muse dashboard app', projectId: 'proj-ai-bot-app', tags: ['design', 'adapter'], status: 'active', goal: 'Ship the Muse AI Mode shell', pinned: true, archived: false, lastActivityAt: now - 5 * 60_000 },
  { id: 'conv-ale', title: 'ALE Muse slices 5–11', projectId: 'proj-ale', tags: ['unpushed'], status: 'waiting-on-owner', goal: 'ALE Muse integration', pinned: false, archived: false, lastActivityAt: now - 26 * 60_000 },
  { id: 'conv-nibglider', title: 'NibGlider layout fix', projectId: 'proj-nibglider', tags: ['gate', 'unpushed'], status: 'active', goal: 'NibGlider panel layout', pinned: false, archived: false, lastActivityAt: now - 12 * 60_000 },
  { id: 'conv-ansci', title: 'AnSci CSKG chat', projectId: 'proj-ansci', tags: ['transcripts'], status: 'active', goal: 'AnSci chat engine', pinned: false, archived: false, lastActivityAt: now - 18 * 60_000 },
  { id: 'conv-strokecore', title: 'StrokeCore Textura construction', projectId: 'proj-strokecore', tags: ['calligraphy'], status: 'parked', goal: 'StrokeCore hands', pinned: false, archived: false, lastActivityAt: now - 30 * HOUR, proposedTitle: 'StrokeCore — Dürer Textura build' },
  { id: 'conv-chinese', title: 'Chinese book — Numbers chapter', projectId: 'proj-chinese', tags: ['book-chapter'], status: 'waiting-on-bot', goal: 'Chinese book v1', pinned: false, archived: false, lastActivityAt: now - 5 * HOUR },
  { id: 'conv-lattice', title: 'Lattice shading idea', projectId: null, tags: [], status: 'active', goal: '—', pinned: false, archived: false, lastActivityAt: now - 50 * 60_000 },
];

export const SEED_SCHEDULE: ScheduleItem[] = [
  { id: 'sched-briefing', title: 'Morning briefing', projectId: null, dayOffset: 0, startHour: 8, spanHours: 1 },
  { id: 'sched-sweep', title: 'Goal / idea sweep', projectId: null, dayOffset: 1, startHour: 9, spanHours: 1 },
  { id: 'sched-push', title: 'NibGlider push decision', projectId: 'proj-nibglider', dayOffset: 1, startHour: 14, spanHours: 1, awaitingOwner: true },
  { id: 'sched-numbers', title: 'Chinese book — Numbers chapter session', projectId: 'proj-chinese', dayOffset: 3, startHour: 10, spanHours: 2 },
  { id: 'sched-ansci', title: 'AnSci transcript review', projectId: 'proj-ansci', dayOffset: 4, startHour: 15, spanHours: 1 },
  { id: 'sched-ale', title: 'ALE slices push window', projectId: 'proj-ale', dayOffset: 5, startHour: 11, spanHours: 1, awaitingOwner: true },
];

export const SEED_ARTIFACTS: ArtifactItem[] = [
  { id: 'art-mission-desk', name: 'Mission Desk for Muse', kind: 'app', description: 'The from-scratch organisation board: projects with status, running work, an editable conversation database, schedule and provenanced artifacts over a simulated Muse adapter.', provenance: { bot: 'Kavi', chat: 'Build Muse dashboard app', project: 'ai-bot-app', goal: 'Ship the Muse AI Mode shell' } },
  { id: 'art-bot-apps-os', name: 'Bot Apps OS — Muse AI Mode', kind: 'app', description: 'The seed-influenced first take: bot sidebar, stationary rail, MockAdapter status drawer and the multitasking simulation.', provenance: { bot: 'Kavi', chat: 'Build Muse dashboard app', project: 'ai-bot-app', goal: 'Ship the Muse AI Mode shell' } },
  { id: 'art-ale-themes', name: 'AI Live Editor Themes', kind: 'design', description: 'Theme system prototype for the editor: dark-2020s, dark-pro-classic (shaded) and gray-pro-classic token sets.', provenance: { bot: 'Kavi', chat: 'Define UI theme design tokens', project: 'AI Live Editor', goal: 'ALE Muse integration' } },
  { id: 'art-banner', name: 'Banner Studio — Relationships Lab', kind: 'app', description: 'Ground-first composition lab: elements bound by relationships that re-solve live when the ground changes.', provenance: { bot: 'Kavi', chat: 'Banner Studio relationships', project: 'StrokeCore', goal: 'StrokeCore hands' } },
  { id: 'art-chinese-map', name: 'Chinese map + timeline outline', kind: 'document', description: 'Interactive map of China with a clickable timeline of historical periods, for the book/app.', provenance: { bot: 'Kavi', chat: 'Chinese book — Numbers chapter', project: 'Chinese Book', goal: 'Chinese book v1' } },
];

/** The pending approval seeded into NEEDS YOU (an app-level decision in this
 * slice — the adapter's resolveApproval is 'unsupported' until slice 6). */
export const SEED_APPROVAL = {
  id: 'approval-nibglider-push',
  conversationId: 'conv-nibglider',
  title: 'Push NibGlider layout fix to main?',
  detail: 'fix/object-menu-and-boxes · gate 730/727/3',
};

/** Canned per-conversation message history the mock adapter reports. */
export const SEED_MESSAGES: Record<string, ChatMsg[]> = {
  'conv-main': [
    { id: 'm-main-1', role: 'user', text: 'Morning. What needs me today?', ts: new Date(now - 2 * HOUR).toISOString() },
    { id: 'm-main-2', role: 'bot', text: 'Two things: the ALE slices 5–11 push decision, and the NibGlider layout fix is verified and held for your word. Everything else is running or parked.', ts: new Date(now - 2 * HOUR + 60_000).toISOString() },
  ],
  'conv-ai-bot-app': [
    { id: 'm-app-1', role: 'user', text: 'This Muse AI app has no organisation. Build me the shell it is missing.', ts: new Date(now - 40 * 60_000).toISOString() },
    { id: 'm-app-2', role: 'bot', text: 'Design written (DESIGN.md): adapter first, MockAdapter status as slice 1, organisation layer as the point of the whole app — projects with status, work in flight, approvals and schedule visible, artifacts with provenance.', ts: new Date(now - 38 * 60_000).toISOString() },
    { id: 'm-app-3', role: 'user', text: 'yes build this — Mission Desk composition.', ts: new Date(now - 6 * 60_000).toISOString() },
    { id: 'm-app-4', role: 'bot', text: 'Building slices 0–1 on feat/mission-desk-slices-0-1: scaffold, derivePhase + MockAdapter status, then the Mission Desk shell driven by them.', ts: new Date(now - 5 * 60_000).toISOString() },
  ],
  'conv-ale': [
    { id: 'm-ale-1', role: 'bot', text: 'Slices 5–11 are built and verified on feat/musecode-slices-5-11 (gate 1470/1466, the 4 failures pre-existing on main). Nothing pushed — the push is your call.', ts: new Date(now - 26 * 60_000).toISOString() },
  ],
  'conv-nibglider': [
    { id: 'm-nib-1', role: 'user', text: 'Fix the Object menu height and the tutorial bubbles going off-screen.', ts: new Date(now - 30 * 60_000).toISOString() },
    { id: 'm-nib-2', role: 'bot', text: 'Done on fix/object-menu-and-boxes: menu 1302px → 637px, bubbles clamp in viewport, walk of all 140 steps clean. Gate 730/727/3. Held for your push word.', ts: new Date(now - 12 * 60_000).toISOString() },
  ],
  'conv-ansci': [
    { id: 'm-ans-1', role: 'user', text: 'Review the latest CSKG transcript batch against the engine.', ts: new Date(now - 20 * 60_000).toISOString() },
    { id: 'm-ans-2', role: 'bot', text: 'Working through the batch now — checking grounding and sense selection turn by turn.', ts: new Date(now - 18 * 60_000).toISOString() },
  ],
  'conv-strokecore': [
    { id: 'm-str-1', role: 'bot', text: 'Textura construction from Dürer’s plates is parked mid-derivation; the by-eye spine estimates are flagged as approximations, per the Phase 3.5 discipline.', ts: new Date(now - 30 * HOUR).toISOString() },
  ],
  'conv-chinese': [
    { id: 'm-chi-1', role: 'user', text: 'Next Numbers chapter session: counting and the order of things, via the Three Character Classic passage.', ts: new Date(now - 5 * HOUR).toISOString() },
    { id: 'm-chi-2', role: 'bot', text: 'Queued. The draft outline is ready; I am waiting on the adapter session to continue the chapter pass.', ts: new Date(now - 5 * HOUR + 120_000).toISOString() },
  ],
  'conv-lattice': [
    { id: 'm-lat-1', role: 'user', text: 'Idea: lattice shading for the NibGlider panel headers — file this somewhere sensible.', ts: new Date(now - 50 * 60_000).toISOString() },
  ],
};
