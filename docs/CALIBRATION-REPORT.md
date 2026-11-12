# Calibration report — extension fitted to the real muse.ai

Branch `feat/real-page-calibration`. Brief:
`docs/muse-code-calibration-brief.md`. Survey:
`docs/survey/muse-ai-dom-survey.md` (addendum §6 below covers
Phase 3 mechanics).

## Result

App at `http://localhost:4173/?adapter=muse` shows **ready, 11/11**
against the real muse.ai, identity **Kavi**. Sends from the app land
in the real tab, replies stream back, exactly one final each. No
owner content, credentials, or session material was read, stored, or
transmitted; all sends happened in one test side chat I created.
The 6 test sends are the only content quoted anywhere in this report.

## What matched the model

- Fuse B end to end: bridge (127.0.0.1:7701) ↔ background worker
  (pairing token from `bridge/.pairing.json`) ↔ content script ↔ app.
- Composer input path: native value setter + `input`/`change` events
  registers with the page framework; the page's own Send delivers.
- Send confirmation by observation, delta streaming + quiet-settle
  final, `bots.changed` identity, adapter `derivePhase` mapping —
  all behaved as designed once selectors matched.

## What differed, and every change (with evidence)

1. **Shell anchors** (`selectors.js` `appRoot`). No `#root`, `<main>`,
   or `data-testid="app-root"`. Real: Next.js shell;
   `#hatch-chat-scroll` (stable id, unique), fallbacks
   `[data-hatch-vt-pane]`, `[data-hatch-chat-column]`. Evidence:
   pre-fit app state ERROR 3/11 with "Expected app root not found";
   post-fit 11/11.
2. **Identity** (`signedInMarker`, `agentName`). Agent name is a bare
   leaf SPAN flagged `[data-hatch-speech-bubble-name-visible]`
   (inside `[data-hatch-avatar-stage]`). `signInUi` needed no change
   (0 matches while signed in — correctly absent).
3. **Composer** (`composer`). Real element is
   `TEXTAREA[aria-label="Message"]` with
   `[data-hatch-composer-prehydration-input]`; added both ahead of
   the placeholder fallback. `button[aria-label="Send"]` renders
   only while the composer is non-empty — absence at rest is a
   state, not a miss (verified by typing then clearing).
4. **Message model** (`messageItem` + `content.js`). Fixture
   `[data-msg-id]` vs real `DIV[data-message-item]` with stable
   `data-message-id`, `data-message-role=user|assistant`,
   `data-message-side=user|agent` (counts in main chat: 8/32),
   no timestamp attribute. `content.js` now reads both attribute
   families via `msgIdOf`/`msgRoleOf`/`msgTsOf` (touch justified:
   attribute names genuinely differ). Real conversation ref is the
   path (`/thread/<id>`), so `currentConversationId` uses
   `location.pathname`. `messageItem` matches both worlds:
   `'[data-msg-id],[data-message-item]'`.
5. **`You:` speaker prefix** (`content.js`, found in Phase 3). Real
   user items render `"You:<text>"` (visually-hidden marker in
   `textContent`). Exact-match confirmation therefore failed every
   send ("Sent was clicked but the message never appeared").
   Fix: `stripSpeaker` (`/^You:\s*/`) in confirmation and history
   snapshot. Assistant items carry no prefix. Fixture texts pass
   through unchanged.
6. **Activity panel** (`activityPanel`). Real:
   `DIV[data-testid="hatch-status-panel-sliding-surface"]`.
   Entries are buttons with NO per-entry id (only `data-slot`,
   `data-pel-click`, `data-state`); `activityEntry` intentionally
   keeps only the fixture hook — entry-identity synthesis is
   deferred, not guessed (see gaps).
7. **No working-indicator fallback added — deliberately.** Seven
   empty `[role="status"]` live regions exist, and per-message
   `DIV[aria-busy]` flags toggle during generation (candidate:
   `[data-message-item][aria-busy="true"]`, transitions unobserved —
   nodes appear replaced, not mutated). Matching `[role="status"]`
   would break settle (a visible-but-empty region reads as "still
   working"), so settle-on-quiet stands; verified: every reply
   finalized exactly once. The `aria-busy` mapping is proposed for
   a follow-up, not shipped.

## Phase 3 results

1. **Connect: PASS.** Ready 11/11, identity Kavi (see above).
2. **Send loop: PASS** (after fix 5). Four app sends in the test
   chat; each appeared in the real tab, each reply streamed into
   the app, exactly one final per send. Two pre-fix attempts also
   landed in-page (confirmation, not delivery, was broken).
3. **Second send + app reload: PASS.** Transcript coherent after
   reload; snapshot history matches page truth item-for-item
   (no duplication beyond what truly happened in-page). All
   re-stamped `nowIso` (real items carry no timestamp).
4. **Approvals: NOT EXERCISED.** No genuine request occurred;
   nothing simulated. Selectors stay fixture-only.
5. **Activity: PARTIAL.** Panel observed, checks pass; the panel
   carries scheduled-task history, not per-chat running entries —
   no Running Now mirror of the test-chat task was observed.
   Entry mapping stays deferred (see gaps).
6. **Negative path: MIXED, with one real finding.** Draft typed in
   the app is preserved across tab close; a send with no tab fails
   without losing the draft; reopening the tab returns the app to
   ready. BUT the app never leaves ready while the tab is closed:
   **tab-close is not detected** (background keeps a stale
   `museTabId`; no `tabs.onRemoved` handling; checks go stale-pass).
   Composer gating therefore does not engage. Identical on the
   fixture (mechanism, not page, issue) — out of scope for a
   selector fit; proposed fix is a presence protocol
   (`tabs.onRemoved` + bridge tab-presence), not a selector.

## Gaps / not exercised live

- Approval render, control labels, outcome signal (no specimen).
- `activityEntry` identity + detail/outcome mapping (no per-chat
  entries observed); `workingIndicator` exact lifecycle
  (`aria-busy` candidate proposed, unverified).
- Reload / new-chat / switch-conversation survival of selectors:
  reload and new-chat verified; switching between conversations
  not tested (read-only rule toward owner chats).
- Enter-to-send (would send outside the app flow; untested).
- Fixture regression probes (`scripts/probe-slice*.mjs`): NOT
  runnable in this environment (harness hardcodes the builder's
  `/home/hatch` paths and playwright install). `npm test` green
  (71/71) before and after; fixture `data-testid` entries kept as
  first fallbacks so the fixture contract is unchanged by
  construction.

## Operational lessons (README updated)

- The MCP `install_extension` call snapshots the folder: after
  editing `extension/`, REINSTALL — `reload_extension` alone
  re-reads the stale snapshot (cost one full debug cycle).
- `md-state` (via popup page) distinguishes "bridge down" from
  "tab unregistered" when checks stall.
- This sandbox blocks listening sockets: bridge/preview needed
  escalated one-time approval; both die with this session (macOS,
  no `setsid`). Restart: `cd bridge && npm start`,
  `npx vite preview --port 4173 --strictPort`.

## Commits on this branch

- `15a4d7a` survey skeleton; `c1f4b4f` survey findings;
  `f8f076b` selector fit; `3bc40e8` `You:`-prefix fix.
  Report/README/survey-addendum commit follows.
  Nothing pushed (awaiting owner word).

## Test footprint on the owner's account

One test side chat (4 user sends, 4 one-word/short replies, 1 plan
reply — all mine, all quotable above); main chat untouched; no
approvals touched; nothing pushed.
