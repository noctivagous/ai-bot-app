# Feature map — muse.ai surfaces ↔ Mission Desk

**Status: DRAFT v0.1 (2026-11-12)** — drafted from the calibration DOM
survey (`docs/survey/muse-ai-dom-survey.md`), the calibration report, and
the public features page. It has **not** yet seen the client's surfaces
rendered; `docs/muse-code-ui-survey-brief.md` commissions that survey, and
its report revises this map. The owner judges the verdicts; nothing here is
a build order yet.

Verdicts: **mirror** (same words/behaviour — it is the product's, not ours)
· **adapt** (same job, desk form) · **different** (deliberately not mapped).

| # | Muse surface (evidence) | Mission Desk counterpart today | Verdict | Refinement it implies |
|---|---|---|---|---|
| S1 | Shell: dock rail (`hatch-dock-rail`) with nav items (chat, search, …), chat switcher trigger, Activity toggle in the chrome | TopStrip: wordmark, mode segment, search well, adapter cluster; view segment below | adapt | Keep desk chrome ours; adopt Muse's *names* where a thing is the same thing (Activity, Search). Adapter cluster gains a disclosure caret (R1). |
| S2 | Conversation switching: `/thread/<id>`, switcher list, "New side chat"; titles are the client's | Conversations table (app-owned records: project, tags, status, renameable title) + Inbox tray | adapt | Records stay ours (that is the app's point); mirror the switcher's recency/search behaviour in the table's defaults. Selector survival across a switch is still untested — the UI survey closes it with test chats. |
| S3 | Message presentation: agent name leaf (`[data-hatch-speech-bubble-name-visible]`), message grouping attrs, date separators, **no timestamps**, visually-hidden "You:" prefix on user items | ChatPanel: anonymous bot bubbles, blue user bubbles, a timestamp under **every** message | mirror | Name leaf on agent groups ("Kavi"), group consecutive messages, date separators, timestamps demoted to hover. User/agent distinction by placement + name, not only colour. |
| S4 | Composer: TEXTAREA "Message"; **Send button exists only while the composer is non-empty**; Enter behaviour untested | ChatPanel composer: Send always rendered, dimmed when empty, amber keyed to phase not content; Enter sends (Shift+Enter newline) | **owner decision D1** | Mirror Muse (send materialises on text) vs keep the pro-app always-visible button. The UI survey tests Enter on the real client first — parity data before deciding. |
| S5 | Working signals: per-item `DIV[aria-busy]` toggles (by node replacement), 7 empty `[role="status"]` live regions; replies settle on quiet | Streaming bubble with amber pulse; job cards with progress sheen; pulsing state chips; glowing lamp — **four** "working" dialects | mirror the signal, unify the dialect | One grammar for "the agent is working": the pulse. Sheen and lamp-glow demote to supporting roles. When `aria-busy` verifies on the real page, the chat shows a slim "Kavi is working" line tied to it. |
| S6 | Activity panel: sliding surface; H3 sections by day ("Today", "Yesterday", dates) under a "N scheduled task(s)" header; entries are buttons with no ids; detail = expanded content; carries scheduled-task history, not per-chat running entries | Board zones (Needs You / Work in Flight / Recently Finished) fed by adapter activity events, one live slot per conversation | adapt | Rename/re-shape Board zones so the correspondence reads at a glance (Activity is Muse's word). Keep the desk's cross-chat aggregation — that is the desk's added value. Entry identity stays synthesized and conservative (DESIGN §2.10). |
| S7 | Approvals: **never observed on the real page.** Features page: approve with *allow once / always allow / deny*, defaults settable per connection | Needs You approval rows, scopes (once/always) wired end-to-end on the fixture (slice 6) | mirror the wording | Adopt the client's exact labels and scope semantics — approving must feel like the same act in both places. Final fit waits for a genuine specimen (survey rule: never simulated). |
| S8 | Scheduled tasks: visible in Activity ("1 scheduled task"); agent-created; management surface TBD by survey | Schedule view: Gantt (7-day), entries filed only via accepted chat proposals | adapt | Keep proposal-first filing (manual-first is ours). The seed's calendar view was never built — candidate backlog item once the survey shows how Muse presents schedules. |
| S9 | Goals & Ideas: first-class product surfaces (features page) | None — parked by owner's decision (DESIGN §2.12) | different (for now) | The survey still documents their form, so the parked decision has a designed counterpart waiting: likely a Board zone mirroring Muse's goals, with Ideas arriving as proposals (the §2.9 pattern). Building stays parked until the owner un-parks it. |
| S10 | Artifacts: produced in chat, hosted by Muse | Artifacts view: cards + provenance (bot / conversation / project / goal), in-app viewer | adapt | Provenance language should echo the client's own labels where they exist (survey S10). Viewer stays ours. |
| S11 | Search: dedicated nav surface (`hatch-nav-search`) | TopStrip search well filtering the conversations table | adapt | Ours searches *records*, Muse's searches everything — keep ours scoped and say so in the placeholder. Affordance pass: icon, clear button, ⌘K focus, Esc clears (R6). |
| S12 | Settings / connectors / permissions surfaces, incl. per-connection approval defaults | Board Control Panel (bot surface actions) + Resources registry (per-bot toggles) | adapt | If the client exposes per-connection approval defaults, the desk's "always" scope should name the same connection it binds to (slice 6 already carries scope on the approval). Registry stays toggles-only until data flows are un-parked. |

## Cross-cutting refinements (the "one layer deeper" list)

From Kavi's sweep of the current build, 2026-11-12. These are desk-internal
and do not wait for the survey.

- **R1 — Every element announces its kind.** The adapter cluster is a status
  readout that is secretly a button: give it a disclosure caret (rotates on
  open). Audit for siblings: anything clickable must carry a control's
  signals; anything read-only must not wear them.
- **R2 — Readouts must not look like controls.** The popover's capability
  chips are read-only but shaped like toggles. Pills = state, and state
  only; data gets tags; controls get raised keys. Write the shape grammar
  down and fix violators.
- **R3 — Control height tokens.** Snap all controls to a 24 / 28 / 32 scale
  (the standing direction: compact layered grid, nothing over 50px).
  Today heights are hand-padded per component.
- **R4 — Popover/dialog behaviour.** Esc closes, focus enters on open and
  returns on close, caret shows state. Applies to the connection popover
  first, then everywhere.
- **R5 — Friendly names for internals.** The chat's degraded strip prints
  raw capability keys ("lost capabilities: activity"); the check list shows
  "pass · req". Map internal keys to user words at the surface.
- **R6 — Search well affordances** (see S11).
- **R7 — Motion.** Slide-over and popover get a short ease in/out;
  reduced-motion already respected for sheen/pulse — extend that respect
  to the new transitions.
- **R8 — Scrollbars.** The app's main region still uses styled native
  bars; the drawn-bar approach proven in `introduction.html` is the house
  solution now — apply it to the desk's main scroll region for consistency.

## Owner decisions queued

- **D1 (S4):** composer send behaviour — mirror Muse's materialising Send
  button, or keep the always-visible pro-app button (made content-aware)?
- **D2 (S6):** Board zone naming — adopt "Activity" as the umbrella word
  for the board's live zones, or keep desk-native names (Needs You / Work
  in Flight / Recently Finished) under an Activity heading?
- **D3 (S9):** Goals/Ideas — confirm still parked after the survey documents
  their form, or un-park the mirror design (not the build)?

*Next revision: when `docs/UI-SURVEY-REPORT.md` lands.*
