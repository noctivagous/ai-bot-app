# muse.ai DOM survey (real page)

Live survey against https://muse.ai, per `docs/muse-code-calibration-brief.md`
Phase 1. Structure and UI vocabulary only — no message content,
credentials, or session material. Owner content is never quoted here;
test prompts I generate are in §2.

Surveyed 2026-11-12, signed in, main chat + one new empty side chat
(`/thread/new`, created via "New side chat").

## Baseline pre-fit app state

App at `http://localhost:4173/?adapter=muse` with the unfitted extension:
**ERROR 3/11** — `bridge`/`extension`/`tab` pass, `page` fails
("Expected app root not found — is this the Muse page?"), everything
else pending. Honest failure, exactly as designed.

## 0. Global facts

- Next.js app (`NEXT-ROUTE-ANNOUNCER`, `#_R_` scripts). No `#root`,
  no `<main>`, no `[data-testid="app-root"]` anywhere.
- **33 `[data-testid]` hooks exist, all `hatch-*` namespaced**
  (stable product vocabulary, not generated): `hatch-dock-rail`,
  `hatch-nav-chat`, `hatch-nav-search`, `hatch-chat-switcher-trigger`,
  `hatch-status-panel-sliding-surface`, `hatch-status-panel-close`,
  `hatch-composer-placeholder-overlay`, `hatch-browser-task-banner-host`,
  … (full list in probe output; `hatch-nav-system-item-*` carry hex
  suffixes that look derived — do not use those).
- Stable structural anchors (id / UI-vocab data attrs, no generated
  classes): `#hatch-chat-scroll` (scroll container, unique),
  `[data-hatch-chat-column]` (4 on page — one per pane),
  `[data-hatch-vt-pane]` (3), `[role="log"][aria-label="Chat messages"]`.

## 1. Shell & identity

| Key | Real counterpart | Tag/role/label | Matches (main / new chat) | Survives reload / new chat / switch |
|---|---|---|---|---|
| `appRoot` | `#hatch-chat-scroll` | DIV, scroll container, `data-scrolltracepolicy` | 1 / 1 | yes / yes / not yet (switch = TODO Phase 3) |
| fallback | `[data-hatch-vt-pane]` | DIV | 3 / 3 | yes / yes |
| fallback | `[data-hatch-chat-column]` | DIV | 4 / 4 | yes / yes |
| `signedInMarker` | `[data-hatch-speech-bubble-name-visible]` | SPAN, leaf text = agent name | 1 / 1 | yes / yes |
| fallback | `[data-hatch-avatar-stage]` | DIV, ancestor of name SPAN | 1 / 1 | yes / yes |
| `agentName` | `[data-hatch-speech-bubble-name-visible]` | SPAN, leaf text = display name ("Kavi") | 1 / 1 | yes / yes |
| `signInUi` | `a[href*="login" i],a[href*="sign-in" i]` | — | 0 / 0 while signed in | n/a (must stay absent) |

Notes: the agent name renders as a bare leaf SPAN in three places
(avatar stage, speech-bubble name flag, avatar status pill); the
`[data-hatch-speech-bubble-name-visible]` one is the semantic name
element. Signed-out page was surveyed pre-sign-in: landing with
"Log in or create an account" heading — sign-out re-check SKIPPED per
brief (will not sign the owner out).

## 2. Composer mechanics

- Element kind: **TEXTAREA** (`rows=1`, `aria-label="Message"`,
  `placeholder="Message"`, `data-hatch-composer-prehydration-input`,
  autofocus). Not contenteditable.
- Send control: **`button[aria-label="Send"]`** — rendered only while
  the composer is non-empty (absent at rest, appeared after input,
  removed again ~1 render after clearing). Never `type=submit`.
- Native-setter path VERIFIED: setting via
  `HTMLTextAreaElement.prototype.value` setter + `input`
  (`insertText`) + `change` events holds the value and the framework
  enables Send. Typed text (my content):
  "Calibration probe 1-2-3 — no reply needed." Draft cleared after;
  nothing sent.
- Whether Enter sends: NOT tested (would send outside the app flow;
  deferred to Phase 3, which clicks the real Send via the app).

| Key | Real counterpart | Matches empty / with text |
|---|---|---|
| `composer` | `textarea[aria-label="Message"]` (+ `data-hatch-composer-prehydration-input`) | 1 / 1 |
| `sendButton` | `button[aria-label="Send" i]` | 0 / 1 |

## 3. Message model

- List: `DIV[role="log"][aria-label="Chat messages"]`, 59 children in
  main chat (incl. one date-separator DIV with no data attrs), 0 in new
  empty chat.
- Items: **`DIV[data-message-item]`** (40 in main chat) with stable
  **`data-message-id`** (values not read — identifiers), and
  `data-message-role=user|assistant` (8/32),
  `data-message-side=user|agent` (8/32). Grouping attrs:
  `data-message-turn-id`, `data-message-group-id`,
  `data-message-group-position`,
  `data-message-grouped-with-next|previous`,
  `data-message-has-presentation`, `data-hatch-link-entry-point`.
  No timestamp attribute (observer falls back to now).
- User vs agent: distinguished by `data-message-role`/`data-message-side`
  (a11y tree also prefixes "User message:" / "Assistant message:" —
  UI vocabulary).
- Streaming mutation pattern: NOT yet observed live (no send done).
  Observer synthesis therefore: list children via
  `[data-message-item]`, id from `data-message-id`, role from
  `data-message-role`. Position+role+text fallback only if id missing.
- `workingIndicator`: 7 empty `[role="status"][aria-live="polite"]`
  regions while idle — candidates, not confirmed. Lifecycle
  (appears/changes/disappears) TODO in Phase 3 send test.

## 4. Approvals — UNVERIFIED, no specimen observed

- Sweeps while idle: zero elements with `approv*` data attributes,
  zero allow/deny/approve-labelled buttons, zero
  `[role="dialog"]`/`[role="alertdialog"]`.
- Render form, control labels, outcome signal: all TODO on a genuine
  request (Phase 3 item 4). Permission UI in settings explicitly NOT
  used as a substitute. No DOM simulation will be done.

## 5. Activity

- Opens via: `button[aria-label="Activity" i]` (pressed while panel open).
- Panel: `DIV[data-testid="hatch-status-panel-sliding-surface"]`
  (2 children; subtree: 211 DIV, 92 SPAN, 44 BUTTON, 4 H3).
- Section headers (H3, UI vocabulary): "1 scheduled task", "Today",
  "Yesterday", "Nov 10" — Active vs Past = expanded groups, not a
  state attribute.
- Entry anatomy: entries are BUTTONs. Buttons carry only
  `data-slot`, `data-pel-click`, `data-state` (attr names only; only
  the close button has a testid). **No per-entry id attribute** —
  entry identity must be synthesized (position + title), see Phase 2.
  `aria-expanded` census over 44 buttons: 35 absent, 4 true, 1 false,
  4 with `aria-pressed` variants.
- `activityDetail` / `activityOutcome`: no dedicated nodes found;
  detail = entry expanded content. Mapping TODO against a running task
  in Phase 3 (test-chat task I start myself).

## 6. Phase 3 mechanics addendum

- Real thread URLs: `/thread/<uuid>` (test side chat kept its id
  across reloads). `data-message-id` values are per-item stable ids
  (values never read — identifiers).
- User-item `textContent` shape: `"You:<text>"` (visually-hidden
  speaker marker). Assistant items: bare text, no prefix.
- Send-button lifecycle: `button[aria-label="Send" i]` appears when
  the composer is non-empty, removed ~1 render after clearing;
  enabled while present. Enter-to-send untested.
- Streaming: new assistant item is created empty (no
  `data-message-role` until content arrives), then grows by suffix
  append; settle-on-quiet (600 ms) verified — every reply finalized
  exactly once with no indicator configured.
- Working-signal candidates: 7 empty `[role="status"]` live regions
  (rejected as fallback — would block settle); per-message
  `DIV[aria-busy]` flags (`true` mid-generation, `false` at rest, 10
  nodes) toggle by node replacement (attribute-mutation observer
  saw no transitions). Proposed, unverified:
  `[data-message-item][aria-busy="true"]`.
- New-chat survival verified (`/thread/new` probe: scroll 1,
  chatcol 4, vtpane 3, log present-but-empty, composer/name/
  activity/panel present, signin/send absent). Reload survival
  verified (test chat kept id + full history). Conversation-switch
  survival NOT tested.
