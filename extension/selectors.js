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
  appRoot: ['[data-testid="app-root"]', '#root', 'main'],
  // Signed-in evidence: the agent identity shown in the shell.
  signedInMarker: ['[data-testid="signed-in-marker"]', '[data-testid="agent-name"]'],
  agentName: ['[data-testid="agent-name"]'],
  // Signed-out evidence: a sign-in affordance and no session marker.
  signInUi: ['[data-testid="sign-in-button"]', 'a[href*="login" i]', 'a[href*="sign-in" i]'],
  // The chat input. Real page: a rich text editor; structural fallback
  // is any textbox-role editable region.
  composer: [
    '[data-testid="composer"]',
    'textarea[placeholder*="Message" i]',
    '[contenteditable="true"][role="textbox"]',
  ],
  sendButton: ['[data-testid="send-button"]', 'button[aria-label="Send" i]', 'button[type="submit"]'],
  messageList: ['[data-testid="message-list"]', '[role="log"]'],
  // Individual messages carry a stable id attribute in the fixture; on
  // the real page the observer works off list children instead.
  messageItem: '[data-msg-id]',
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
  activityPanel: '[data-testid="activity-panel"]',
  activityEntry: '[data-activity-id]',
  activityDetail: '[data-testid="activity-detail"]',
  activityOutcome: '[data-testid="activity-outcome"]',
};

globalThis.MD_CONFIG = {
  bridgeUrl: 'ws://127.0.0.1:7701',
  botId: 'kavi',
};
