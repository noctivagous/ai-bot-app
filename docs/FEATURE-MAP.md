# Feature map — muse.ai surfaces ↔ Mission Desk

**Status: v0.2 (2026-11-12)** — revised from the UI survey: Muse Code's
`docs/UI-SURVEY-REPORT.md` on branch `feat/ui-survey` (tip `ba9c9ec`,
**not pushed — holding for the owner's word**) and the survey room's
record. 11 of 12 surfaces delivered; S7 closed as unobserved (no genuine
approval occurred — the standing rule is never to simulate one). Verdicts
below are firmed by evidence. **Owner decisions D1–D4 were DECIDED on
2026-11-12, per the recommendations** (see the decisions section); the
first refinement tranche — D1, D2, D4 built, D3 as a design sketch
(`docs/GOALS-IDEAS-SKETCH.md`), build parked — is on branch
`feat/ui-refinements`.

Verdicts: **mirror** (same words/behaviour — it is the product's, not ours)
· **adapt** (same job, desk form) · **different** (deliberately not mapped).

| # | Muse surface (what the survey found) | Mission Desk counterpart today | Verdict | Refinement it implies |
|---|---|---|---|---|
| S1 | Shell: icon-only dock rail (Chat ⌘J, Search ⌘K; spaces group Feed/Ideas/Goals/Library; then Create a space, Get the Muse app, Settings menu). Centre chat column. Right status panel 240–420px, resizable, persists across views. **No standalone Activity toggle**: the panel opens from the avatar/Kavi button; its header tabs are **Activity / Approvals / Identity / Mail**. Main-chat top bar **unobserved** (escalated — see Open items). | TopStrip: wordmark, mode segment, search well, adapter cluster; view segment below | adapt | Keep desk chrome ours; adopt Muse's names where the thing is the same (Activity, Search). The avatar button is R1 done right — one button that plainly opens a panel; the adapter cluster should read the same way (R1, R4). |
| S2 | Switcher is a **persistent left navigator** ("Side chats"), not a dropdown: search box, "Side chat options" menu ("Keep chat panel visible", "Show archived chats"), "Main chat" button. **Selector survival across a switch: tested between two test chats and closed** — the calibration gap is shut (counts in the report). | Conversations table (app-owned records) + Inbox tray | adapt | Records stay ours. Mirror the navigator's recency/search defaults in the table. The survival result also clears the extension's riskiest unknown. |
| S3 | Rendered log: date separator = centred **time-only pill** ("6:16 AM", same-day; older formats unobserved). User messages: right-aligned pale-teal pills, no visible name ("You:" is DOM-only). Agent messages: short = small grey chips, long/multi-part = light-grey rounded cards (multi-part stays in one card); code blocks carry a language label + Download file / Copy Code. **The agent name leaf appears nowhere in the log** — "Kavi" lives only in the panel header. **No timestamps anywhere; hover shows nothing.** Per-message actions exist (user: More options / Copy response / Reply; agent: React / Reply / More options). | ChatPanel: anonymous bot bubbles, blue user bubbles, a timestamp under **every** message | mirror, with two recorded exceptions | Mirror: centred time pills as separators, placement+container distinction (drop "blue = user" as the only signal), one-card multi-part replies. **Exceptions, both deliberate differences if kept:** a name leaf on agent groups (the client has none in the log), and any timestamps at all (the client has none — "demote to hover" is not mirroring; keeping hover timestamps is a desk choice, to be owned as one). |
| S4 | Composer: empty state = placeholder "Message" + Attach file + Dictate, **no Send**; typing adds Send and nothing else. **Enter sends, Shift+Enter newlines — both verified.** | ChatPanel composer: Send always rendered, dimmed when empty; Enter sends, Shift+Enter newlines (already matching) | **D1 — DECIDED: mirror** (owner, 2026-11-12; built in the first tranche) | Evidence favours mirroring: our keyboard semantics already match exactly; only the button's existence differs. Muse Code's recommendation into D1: mirror the materialising Send. |
| S5 | Working grammar, always-visible part: **the stream itself + a "Stop" button** (verbatim). Everything else is panel-gated: with the panel open, the header swaps "Connected" (green dot) for "is responding", the avatar switches, entries show a progress icon; **with the panel closed, nothing anywhere says working**. Stop stands the partial as a normal message, **unmarked as cut short**; its panel entry ends "Interrupted". Per-item `aria-busy` candidate from calibration stands as the mechanism. | Streaming bubble with amber pulse; job cards with progress sheen; pulsing chips; glowing lamp — four "working" dialects | adapt | One grammar (R-list): the pulse, everywhere, plus a slim "Kavi is working" line in the chat — recorded as a **desk surfacing of what the client gates**, not a mirror. **New question for the owner (D4):** mark interrupted partials as cut short (client doesn't; desk could — a deliberate difference with real value for records)? |
| S6 | Activity: **every reply creates an entry** (one-word replies included), all in **one day-grouped list** ("Today") — **no separate Running section**; state is icon (progress while running, check when done) + outcome text. Entry dialogs are asymmetric: an "Interrupted" outcome opens **"Error \<title\>"** (body: status word, Started, tool steps, Queries, Result), a finished one **"Complete \<title\>"** (Completed + Summary). The "Error" prefix conflates interruption with failure — a client inconsistency, recorded as found, not copied. | Board zones (Needs You / Work in Flight / Recently Finished), one live slot per conversation | adapt | The desk's Running/Finished split is **our grouping invention** over the client's single list — keep it (cross-chat aggregation is the desk's value) and label it as ours. The §2.10 premise is restored: Activity *can* feed the board, per-reply. Direct input to D2. |
| S7 | **Unobserved — closed as such.** No genuine approval occurred during the survey; selectors remain fixture-fitted (calibration status unchanged). | Needs You approval rows, scopes wired on the fixture (slice 6) | mirror the wording, when a specimen exists | Nothing to fit yet. The first genuine approval in real use is still the test. S12's precision applies: the client's Permissions defaults are an **ask-policy** layer (whether it asks), distinct from an approval's **answer** (allow once / always / deny) — our scope model already matches the answer layer. |
| S8 | Scheduled tasks: "See all scheduled tasks" opens a **"Scheduled tasks" dialog** (not a view): day groups ("Daily"), entry rows (icon, title, cadence). Entry detail dialog's management set is **exactly four: Run history, See more, View permissions, Delete** (Delete one level deep). **No create, edit, pause, or resume affordance anywhere** — creation and edit are unmapped (creation evidently happens through the agent/chat). | Schedule view: Gantt (7-day), proposal-filed entries | adapt | Thinner than v0.1 assumed — correct the mental model: the client offers *oversight + delete*, not management. The desk's proposal-first filing already exceeds it; keep. The seed's calendar view remains unbuilt and now has no client counterpart to mirror — desk-native if ever built. |
| S9 | **Ideas (/ideas):** H1 + intro + "Open side-by-side chat"; "Featured ideas" region, then H2 category regions (Financial Management, Productivity, Relationships, Health & Fitness, Shopping). Item = full-width button (title + description) + "More options for …" menu. **Goals (/goals):** "Tracking" region of goal rows (checkbox "Mark … complete", a live status region that **rendered empty in every snapshot** — content kind unobserved, goal button with title + detail, "Goal options" menu), "Show 10 more"; "Create a goal" region with category buttons (Health, Relationships, Finance, Career, Interests, Productivity, Something else). | None — parked by owner's decision (DESIGN §2.12) | different (for now) — input to D3 | The parked decision now has concrete forms to design against: a Goals mirror would be a read-mostly Board zone (rows + complete-checkbox state), Ideas the proposals pattern (§2.9) with "Open side-by-side chat" as the act. Design can be sketched without un-parking the build. |
| S10 | **The Library is the only artifact surface** (/library/artifacts): left navigation (search "Search the Library"; Files: Spaces, Documents; Media: Images, Videos, Podcasts; System files), Spaces view with Select / "Sort spaces" (never opened — unobserved) / "Create a space", "Recent" rows (name + type + age), "Quick Open". **No in-chat artifact presentation exists** — nothing a test chat produced rendered as panel, card, or viewer; a code block's Download file is a message-block control. | Artifacts view: cards + provenance, in-app viewer | adapt | Basis corrected: there is no in-chat surface to mirror — the desk's Artifacts view is organisation *of* Library items, which is precisely the app's charter. Library vocabulary (Spaces, Documents, Recent) is available to echo in provenance labels. |
| S11 | Two search surfaces: the global overlay **"Search Muse"** (⌘K: H2 dialog, combobox, suggestions listbox, Esc closes) and the Library's own search. | TopStrip search well filtering the conversations table | adapt | Ours searches *records* — keep scoped, say so in the placeholder. Mirror the interaction grammar: ⌘K focuses, Esc clears/closes (R6). |
| S12 | Settings is an H2 dialog; left nav: General / Connectors / Wallet / Secure store / Permissions / Messaging channels / Devices / Data controls / Voice and avatar / Help & support / Legal info / Log out. A Keyboard Shortcuts dialog exists (⌘/). Permissions defaults are **ask-policy**; per-connection granularity **unobserved** (behind an unvisited sub-view). | Board Control Panel + Resources registry (toggles only) | adapt | Keep registry toggles-only. Where our approval UI says "always", it binds to the *answer* layer (S7 note), not the client's ask-policy — keep those words distinct in our copy so the two layers never blur for the user. |

## Corrections this survey made to v0.1

1. **Name leaf**: v0.1 proposed mirroring an agent name leaf on message
   groups. The client renders no name in the log at all — a leaf would be
   a deliberate difference, not a mirror. (S3)
2. **Timestamps**: v0.1 said "demote to hover". The client has none and
   hover shows nothing — any timestamp we keep is a desk invention. (S3)
3. **Running Now**: v0.1 (and DESIGN §2.10's early reading) pictured
   Activity as having a running view. It is one day-grouped list; the
   desk's split is ours. (S6)
4. **Schedule management**: v0.1 assumed creation/edit/cancel
   affordances. The observed set is Run history / See more / View
   permissions / Delete. (S8)
5. **Approval defaults**: the features-page phrase "per-connection
   defaults" resolves, on observation, to an ask-policy layer distinct
   from an approval's answer; per-connection granularity is unproven.
   (S7/S12)
6. **Activity entry point**: there is no chrome Activity toggle in
   side-chat view; Activity is a tab in the panel the avatar button
   opens. (S1)

## Cross-cutting refinements (the "one layer deeper" list)

Desk-internal; unchanged from v0.1 except where noted.

- **R1 — Every element announces its kind.** The adapter cluster is a
  status readout that is secretly a button: give it a disclosure caret
  (rotates on open). The client's avatar button is the reference pattern.
  Audit for siblings: anything clickable must carry a control's signals;
  anything read-only must not wear them.
- **R2 — Readouts must not look like controls.** The popover's capability
  chips are read-only but shaped like toggles. Pills = state, and state
  only; data gets tags; controls get raised keys. Write the shape grammar
  down and fix violators.
- **R3 — Control height tokens.** Snap all controls to a 24 / 28 / 32
  scale (standing direction: compact layered grid, nothing over 50px).
- **R4 — Popover/dialog behaviour.** Esc closes, focus enters on open and
  returns on close, caret shows state. (The client's own dialogs — Search,
  Scheduled tasks, Settings — all carry Close + Esc grammar; mirror it.)
- **R5 — Friendly names for internals.** The degraded strip prints raw
  capability keys; the check list shows "pass · req". Map internal keys
  to user words at the surface — and keep ask-policy vs approval-answer
  vocabulary distinct (S12).
- **R6 — Search well affordances** (see S11): icon, clear button, ⌘K
  focus, Esc clears.
- **R7 — Motion.** Slide-over and popover get a short ease in/out;
  reduced-motion respected throughout, as the CSS already does for
  sheen/pulse.
- **R8 — Scrollbars.** The drawn-bar approach proven in
  `introduction.html` is the house solution — apply it to the desk's main
  scroll region.
- **R9 — (from S5) One working grammar.** Pulse everywhere; the progress
  sheen and lamp-glow demote to supporting roles. Interrupted partials
  are D4's question, not a default.

## Owner decisions — DECIDED (owner, 2026-11-12, per recommendations)

- **D1 (S4):** composer send behaviour. Evidence: the client materialises
  Send on text; our keyboard semantics already match (Enter sends,
  Shift+Enter newlines). *Recommendation: mirror — materialise on text.*
  **DECIDED: mirror. Built in the first refinement tranche
  (`feat/ui-refinements`).**
- **D2 (S6):** Board zone naming. Evidence: the client's Activity is one
  day-grouped list under the word "Activity"; our zones are a grouping
  invention. *Recommendation: adopt "Activity" as the Board's umbrella
  heading, keep Needs You / Work in Flight / Recently Finished as our
  zones under it — the correspondence reads, the invention stays labelled
  as ours.* **DECIDED: adopt. Built in the first tranche (the zones in
  the code are NEEDS YOU / RUNNING NOW / RECENTLY FINISHED).**
- **D3 (S9):** Goals & Ideas. Evidence: both surfaces' forms are now
  documented (S9). *Recommendation: keep the build parked; commission the
  counterpart sketch (Goals as a read-mostly Board zone, Ideas as
  proposals) as design only, so un-parking later is a build, not a
  research project.* **DECIDED: sketch commissioned —
  `docs/GOALS-IDEAS-SKETCH.md`; the build stays parked until the owner
  un-parks it.**
- **D4 (S5, new):** interrupted partials. The client leaves a stopped
  reply standing unmarked. *Recommendation: mark ours ("Interrupted" in
  the conversation record) — the desk keeps records, and a record that
  hides a truncation misleads; record it as a deliberate difference.*
  **DECIDED: mark ours. Built in the first tranche: flag on the message
  model, mock script + ChatPanel marker end-to-end. Follow-up slice
  (branch `feat/d4-interrupted-wiring`): the real adapter is now wired
  end-to-end via an amend event. The content script — the only
  component that sees both the streaming message and the Activity
  entry in-page — tracks each bot message's streaming window (first
  observed growth → settle final) and each entry's active window, and
  when an entry concludes with outcome "Interrupted" it emits a
  `message.bot.amend` for the message id ONLY when exactly one
  streaming window overlaps the entry's window; zero or multiple
  candidates emit nothing (fail-open by construction — a missed stamp
  matches the client, a wrong stamp is the only unacceptable outcome).
  The adapter translates the frame; the store stamps the delivered
  final, or buffers the amend (bounded) when it beats the final.
  Proven on the fixture by `scripts/probe-interrupted.mjs` (15/15,
  real MV3 extension: late amend patches a delivered final, early
  amend stamps at final, normal reply unmarked, no-overlap
  "Interrupted" stamps nothing). Exactly that much is proven: the
  survey witnessed the Stop behaviour on the real page, but the
  extension's correlation itself has not yet run against a genuine
  Stop on the real page — the fixture is its proof.**

## Open items

- **Main-chat top bar** — unobserved: opening the main chat was outside
  the survey's bounds (it is the owner's real conversation). The survey
  escalated this to the owner: observe it under a one-off permission, or
  leave it unobserved? It is the view Mission Desk most often sits beside.
- **`feat/ui-survey` push** — the report branch (tip `ba9c9ec`) is
  unpushed on Muse Code's side, holding for the owner's word.
- **S7** remains unobserved by design; the first genuine approval in real
  use is the test.
- Create-a-space's landing and "Sort spaces" were deliberately not
  triggered/opened; recorded unobserved.

*Sources: docs/UI-SURVEY-REPORT.md (branch feat/ui-survey), the survey
room record, docs/survey/muse-ai-dom-survey.md, docs/CALIBRATION-REPORT.md.*
