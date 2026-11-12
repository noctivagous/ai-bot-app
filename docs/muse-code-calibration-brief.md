# Brief for Muse Code — calibrate the Mission Desk extension against the real muse.ai

You are picking up a job the original builder structurally could not finish.
Read this whole brief before touching anything.

## What this repo is

`ai-bot-app` ("Mission Desk for Muse") is a local web app that organises a
Muse AI agent's work — projects, a board of work in flight, approvals,
schedule, conversations as fileable records. It talks to the Muse AI web
client (https://muse.ai) through a three-part fuse:

- `extension/` — an MV3 browser extension. Its content script is the app's
  eyes and hands inside a signed-in muse.ai tab: it probes page health,
  types into the real composer, observes streamed replies, clicks real
  approval controls, and mirrors the client's Activity view.
- `bridge/` — a small Node process on 127.0.0.1:7701 relaying between the
  extension and the app, and hosting the app's records.
- `src/` — the app. `src/adapters/MuseAiAdapter.ts` is the adapter;
  `DESIGN.md` §§6 and 9 define the status model and the adapter contract.

## Why you have this job

The extension was built and fully verified against a local fixture page
(`tests/fixture/muse-fixture.html`) that honestly mimics a chat client's
mechanics. It has **never been fitted to the real muse.ai**: nobody on the
build side could use the owner's signed-in session, so
`extension/selectors.js` contains *selector strategies* — role / text /
structural guesses, in fallback order — not selectors measured from the
real page. Its own header says the later entries "are expected to be tuned
during the owner's real-page verification."

That tuning is your job. You have what the builder didn't: a Chrome the
owner controls, driven by you through the Chrome DevTools MCP, with the
owner signing in personally.

## Environment and setup

Work from a clone of `main`. Then:

1. `npm install` at the root; `cd bridge && npm install`.
2. Start the bridge: `cd bridge && npm start`. First run writes the
   pairing token to `bridge/.pairing.json` (gitignored).
3. Build and serve the app: `npm run build && npx vite preview`
   (http://localhost:4173). Leave bridge and preview running.
4. Load the extension into YOUR MCP-controlled Chrome, unpacked, from
   `extension/`. If your Chrome launch is configurable, prefer launching
   with `--load-extension=<abs path to extension/>` and a dedicated
   `--user-data-dir` so reloads are scriptable; otherwise load it through
   the `chrome://extensions` UI (Developer mode → Load unpacked).
   Verify injection on any matched page by the content script's stamp:
   `document.documentElement.getAttribute('data-md-content') === 'ready'`.
5. Pair: open the extension popup and paste the token from
   `bridge/.pairing.json`. The popup should report the bridge connected.
6. **STOP and hand the browser to the owner** to open https://muse.ai and
   sign in. You never type, read, store, or transmit the owner's password,
   one-time codes, cookies, or any session material (see Hard rules).

## The target: the 11 checks

The app derives its connection status from 11 checks, defined in
`src/adapters/MuseAiAdapter.ts`. Required: `bridge`, `extension`, `tab`,
`page`, `auth`, `composer`, `messageList`, `observer`. Optional:
`approvals`, `activity`, `muse.activityPanel`. "Done" for the calibration
core is: app at http://localhost:4173/?adapter=muse shows **ready,
11/11**, with the owner's agent name as identity — reached against the
real muse.ai, not the fixture.

## Phase 1 — Survey the real page (map before you fit)

For every key in `extension/selectors.js`, find its real counterpart and
record evidence in `docs/survey/muse-ai-dom-survey.md` (create it):
element tag, ARIA role, accessible name / visible label, stable
attributes (names of `data-*` attributes; values only if they are UI
vocabulary, never identifiers), a structural path description, how many
elements match, and whether the match survives reload, opening a new
chat, and switching conversations. Structure and UI vocabulary only —
**not** the owner's message content (Hard rules).

Survey, in this order:

1. **Shell & identity** — `appRoot`; the signed-in marker and the agent
   name element (`signedInMarker`, `agentName`); what the page shows when
   signed out (`signInUi`) — if checking signed-out requires signing out,
   SKIP it and note that; do not sign the owner out.
2. **Composer mechanics** — `composer`, `sendButton`. Determine: element
   kind (textarea vs contenteditable), how the send control enables,
   whether Enter sends, and whether the content script's existing input
   path (native value setter / value-tracker bypass + `input` events,
   see `extension/content.js`) actually registers with the page's
   framework. Try it in a NEW empty chat with a harmless test prompt.
3. **Message model** — `messageList`, `messageItem`. How are user and
   agent messages distinguished (roles, structure, labels)? Do messages
   carry any stable id? If not, document the most stable synthesis
   (position + role + text) — the observer currently works off list
   children on the real page. How does a streaming reply mutate the DOM?
   Where is the working/streaming indicator (`workingIndicator`), and
   what is its exact lifecycle (appears / changes / disappears)?
4. **Approvals** — find how approval requests render: inline card, modal,
   or other. You may not be able to summon one on demand; if none occurs
   naturally during your session, map whatever partial evidence exists
   (e.g. permission UI in settings is NOT a substitute — say so) and mark
   this section UNVERIFIED rather than guessing silently. Record the
   exact control labels for allow-once / always-allow / deny (the
   content script needs `approvalAllowOnce`, `approvalAllowPlain`,
   `approvalAlways`, `approvalDeny`) and what in the DOM signals the
   outcome after a click (`approvalOutcome`).
5. **Activity** — how the Activity view opens (`activityButton`), the
   panel's structure (`activityPanel`), entry anatomy (`activityEntry`:
   what identifies an entry, its title, its state), how an entry expands
   to detail (`activityDetail`), and what marks an entry finished with
   its outcome (`activityOutcome`). Note how Active and Past are
   separated. If a running task exists you may observe it; do not invent
   one by sending the owner's agent off on real work — a test-chat task
   you started yourself in Phase 3 is the legitimate source.

## Phase 2 — Fit the extension

- Edit `extension/selectors.js` so every probe matches the real page.
  Keep the strategy rules from its header: role / text / structural
  selectors, generated class names never primary, the fixture's
  `data-testid` entries stay as first fallbacks.
- Touch `extension/content.js` only if the real page's mechanics
  genuinely differ from the model (e.g. composer input path, settle
  signals, message identity) — and say exactly why in your report.
- After each change: reload the extension (extensions-page reload or
  browser relaunch), reload the muse.ai tab, re-check the app status.
- **Regression gate, every time:** `npm test` must stay green (71 tests)
  and the fixture probes must still pass (`node scripts/probe-slice3.mjs`
  and its siblings in `scripts/` — they drive the same extension build
  against the fixture). A selector that fixes the real page by breaking
  the fixture is not a fix.

## Phase 3 — Acceptance on the real page

Run each item and record pass/fail with evidence. Use a NEW conversation
created through the app for sends; your test prompts are your content to
report — the owner's are not.

1. App connects: ready, 11/11 (or list exactly which optional checks
   remain red and why).
2. Send from the app → the message appears in the real muse.ai tab →
   the reply streams into the app → exactly one final message lands.
3. Send again in the same conversation; then reload the app: no
   duplicated finals, history coherent.
4. Approvals (only if a genuine approval request occurs — you may ask
   the owner to trigger one, e.g. by having the agent attempt an action
   that requires permission in your test conversation): resolve it from
   the app's Needs You with **once**, and if a second occurs, **always**;
   verify the page-side outcome matches the app's decision log.
   If no approval can be made to occur, mark this item NOT EXERCISED —
   do not simulate one by editing the DOM.
5. Activity: from your test conversation, give the agent a task that
   takes noticeable time. Watch the app's Running Now mirror the real
   Activity entry (title; expand it — detail should match the panel's),
   and on completion watch it land in Recently Finished with its outcome.
6. Negative path: close the muse.ai tab → the app must degrade honestly
   (tab check fails, composer gating holds, a draft typed in the app is
   preserved). Reopen the tab → recovery to ready.

## Phase 4 — Report and commits

- Work on a branch: `feat/real-page-calibration`. Commit the survey, the
  selector/content changes, and `docs/CALIBRATION-REPORT.md` in small,
  labelled commits as you go.
- The report must state, per area (shell, composer, messages, approvals,
  activity): what matched the model, what differed, every selector or
  behaviour you changed and the evidence for it, the Phase 3 result per
  item, and a plainly-labelled list of anything NOT exercised live.
- If the real UI lacks something the model assumes (a differently-shaped
  Activity view, no distinct streaming indicator), document the gap and
  your proposed mapping in the report instead of silently working
  around it.
- Update `extension/README.md` if any setup step changed in practice.
- **Do not push or merge** without the owner's explicit word. Leave the
  branch ready for review.

## Hard rules (non-negotiable)

- Never read, export, log, or transmit cookies, `localStorage` /
  `sessionStorage` auth data, network authorization headers, passwords,
  or one-time codes. If a step seems to require any of these, stop and
  report instead. The pairing token in `bridge/.pairing.json` is local
  machine config: use it only to pair this extension with this bridge;
  never commit it, never send it anywhere else.
- The bridge binds 127.0.0.1 only. Do not expose it, the preview server,
  or the browser's debugging port beyond localhost.
- Read-only toward the owner's existing conversations and work: you may
  observe Activity structure, but you do not send messages in, approve
  anything in, or otherwise operate the owner's real conversations. All
  sends happen in test conversations you created for this calibration.
- Report structure, not content: your survey and report describe
  elements, labels, and mechanics. Test prompts and replies you generate
  are fine to quote; the owner's are not.
- If the site presents a CAPTCHA or bot check, pause and hand it to the
  owner; do not attempt to defeat it.
