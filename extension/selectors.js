// Mission Desk content-script selector strategy — ONE config object
// (DESIGN.md §9). Rules:
//   - Role / text / structural selectors only, in fallback order.
//   - Generated CSS class names are NEVER the primary selector (they
//     change between deploys); at most a last-resort hint.
//   - The first entries target stable data-testid hooks, which is what
//     the local fixture page implements; the later entries are
//     best-effort structural guesses for the real muse.ai page and are
//     expected to be tuned during the owner's real-page verification
//     (see README.md). A selector that stops matching degrades a check —
//     it never throws.
//
// This file also carries the few non-selector constants the content
// script needs. It contains no credentials and reads none.

globalThis.MD_SELECTORS = {
  // The page is the expected app (muse.ai chat shell / fixture root).
  // Real page (surveyed 2026-11-12, docs/survey/muse-ai-dom-survey.md):
  // Next.js shell, no #root/<main>; the chat scroll container carries
  // the stable id #hatch-chat-scroll.
  appRoot: [
    '[data-testid="app-root"]',
    '#hatch-chat-scroll',
    '[data-hatch-vt-pane]',
    '[data-hatch-chat-column]',
    '#root',
    'main',
  ],
  // Signed-in evidence: the agent identity shown in the shell. Real
  // page: the agent name renders as a leaf SPAN flagged with
  // data-hatch-speech-bubble-name-visible, inside [data-hatch-avatar-stage].
  signedInMarker: [
    '[data-testid="signed-in-marker"]',
    '[data-testid="agent-name"]',
    '[data-hatch-speech-bubble-name-visible]',
    '[data-hatch-avatar-stage]',
  ],
  agentName: ['[data-testid="agent-name"]', '[data-hatch-speech-bubble-name-visible]'],
  // Signed-out evidence: a sign-in affordance and no session marker.
  signInUi: ['[data-testid="sign-in-button"]', 'a[href*="login" i]', 'a[href*="sign-in" i]'],
  // The chat input. Real page: a TEXTAREA (rows=1,
  // aria-label/placeholder "Message", data-hatch-composer-prehydration-input).
  composer: [
    '[data-testid="composer"]',
    'textarea[aria-label="Message"]',
    '[data-hatch-composer-prehydration-input]',
    'textarea[placeholder*="Message" i]',
    '[contenteditable="true"][role="textbox"]',
  ],
  // Real page: button[aria-label="Send"] renders only while the
  // composer is non-empty (survey §2) — absence at rest is a state,
  // not a miss.
  sendButton: ['[data-testid="send-button"]', 'button[aria-label="Send" i]', 'button[type="submit"]'],
  messageList: ['[data-testid="message-list"]', '[role="log"]', '[aria-label="Chat messages"]'],
  // Individual messages: fixture uses [data-msg-id]; the real page
  // uses DIV[data-message-item] with data-message-id,
  // data-message-role=user|assistant, data-message-side=user|agent
  // (survey §3). content.js reads both attribute families.
  messageItem: '[data-msg-id],[data-message-item]',
  // Real page: NO dedicated streaming indicator found (survey §3);
  // several empty [role="status"] live regions exist but matching one
  // would break settle (a visible empty region reads as "still
  // working"), so no structural fallback is offered until the true
  // indicator is observed during a live send (Phase 3). Missing here
  // means settle-on-quiet, which is the safe behavior.
  workingIndicator: ['[data-testid="working-indicator"]', '[data-testid="streaming-indicator"]'],
  // Approvals (§2.12 scopes live in data-scopes="once,always").
  approvalCard: '[data-testid="approval-card"]',
  approvalAllowOnce: '[data-testid="approval-allow-once"]',
  approvalAllowPlain: '[data-testid="approval-allow"]',
  approvalAlways: '[data-testid="approval-always"]',
  approvalDeny: '[data-testid="approval-deny"]',
  approvalOutcome: '[data-testid="approval-outcome"]',
  // Activity (§2.10): Muse's own Activity view is the source of record.
  activityButton: ['[data-testid="activity-button"]', 'button[aria-label="Activity" i]'],
  // Real page: DIV[data-testid="hatch-status-panel-sliding-surface"].
  // Entries inside carry NO per-entry id (survey §5) — entry identity
  // synthesis is deferred to a live-task observation (Phase 3), so
  // activityEntry intentionally keeps only the fixture hook for now.
  activityPanel: ['[data-testid="activity-panel"]', '[data-testid="hatch-status-panel-sliding-surface"]'],
  activityEntry: '[data-activity-id]',
  activityDetail: '[data-testid="activity-detail"]',
  activityOutcome: '[data-testid="activity-outcome"]',
};

globalThis.MD_CONFIG = {
  bridgeUrl: 'ws://127.0.0.1:7701',
  botId: 'kavi',
};
