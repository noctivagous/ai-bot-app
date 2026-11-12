# Brief: muse.ai UI survey for the Mission Desk refinement pass

**From:** Kavi (via the owner)
**To:** Muse Code, driving the owner's Chrome (DevTools MCP), signed in as the owner
**Repo:** `noctivagous/ai-bot-app`
**Deliverable:** `docs/UI-SURVEY-REPORT.md` on branch `feat/ui-survey`
**Companion docs:** `docs/FEATURE-MAP.md` (the map this survey feeds — its
surface IDs S1–S12 are the report's section IDs), `docs/survey/muse-ai-dom-survey.md`
(the structural survey from calibration — this brief covers what that one
could not: rendered layout, visible terminology, and behaviour).

## Why

Mission Desk (this repo) is a dashboard fused to the muse.ai client. It was
calibrated structurally (see the DOM survey) but nobody on the build side has
*seen* the client's surfaces rendered. A refinement pass is now planned so
the desk's UI maps onto the client's surfaces faithfully — same words, same
behaviour where behaviour is the product's, our own graphite skin kept.
This survey is the evidence base for that mapping.

## The working loop

This is not a one-shot assignment. The owner will wire up a side chat as a
working room where you and a Muse (Kavi's counterpart, seeded with this
brief, the feature map, and the design context) can talk directly. Work
the survey **in the loop**:

- **Deliver per surface, not all at once.** Post each S-section to the
  room as you finish it. Expect questions back — probes for the gaps a
  first pass always leaves ("can a running Activity entry be captured?",
  "what exactly does the switcher row show?") — and treat them as part of
  the assignment, not interruptions.
- **Ask as you go.** If a surface doesn't match this brief, a behaviour is
  ambiguous, or a classification under S1–S12 is unclear, ask in the room
  instead of guessing. Survey-scope clarifications get answered there.
- **Escalations leave the room.** The Muse in the room cannot settle:
  anything touching the owner's real conversations beyond shell
  navigation, any interaction with an approval specimen, scope beyond
  this survey, the feature map's owner decisions (D1–D3), or any
  push/merge. Those go to the owner. Credential-shaped material is
  refused outright, per the hard rules.
- **The map is the loop's memory.** Kavi folds the room's findings into
  `docs/FEATURE-MAP.md` as they accumulate; the branch deliverable below
  remains the durable record of the finished survey.

## What to capture, per surface (report sections use these IDs)

For every surface: **layout regions** (what sits where, in prose — left rail /
header / column / panel, approximate proportions), **visible terminology**
(exact labels of buttons, headers, menu items — UI vocabulary is quotable,
conversation content is not), and **behaviour** (what opens what, what
appears/disappears, what state changes look like).

- **S1 Shell & navigation** — the dock rail (`hatch-dock-rail`): every item,
  in order, with its label/tooltip and what it opens. The top bar's
  composition. How the Activity toggle (`button[aria-label="Activity"]`)
  presents (pressed state, placement).
- **S2 Conversation switching** — the chat switcher
  (`hatch-chat-switcher-trigger`): how conversations are listed (grouping,
  ordering, search?), what a row shows (title, time, state?), how "New side
  chat" is offered, what switching does to the URL and the panels.
  **Observe the switcher's list only — do not open the owner's real
  conversations.** Survival of the calibrated selectors across a switch may
  be tested using two test chats you create.
- **S3 Chat & message presentation** — in a **test chat you create**: how
  message groups render (is the agent name leaf shown once per group or per
  message?), date separators (exact format), whether timestamps exist
  anywhere (hover?), how user vs agent messages are visually distinguished,
  code/presentation blocks if any appear from your own test prompts.
- **S4 Composer** — the empty vs non-empty states: what appears beside the
  Send button when text exists (attach? tools?), placeholder text, and the
  Enter behaviour — test in your test chat: does Enter send, does
  Shift+Enter newline? (Calibration left this untested.)
- **S5 Working signals** — during a test-chat reply: what does the user
  *see* while the agent works (status text? spinner? the per-item
  `aria-busy` made visible how?), and what changes when it finishes.
- **S6 Activity panel** — rendered anatomy: width/placement, the section
  headers' exact wording ("1 scheduled task", "Today", …), what an entry
  row shows (icon, title, time, status), what expanding an entry reveals,
  any difference between a *running* entry (start one in your test chat if
  the product lets you) and history entries.
- **S7 Approvals** — **only if a genuine request occurs** while you work:
  render form, exact control labels, placement, what the outcome looks
  like. If none occurs, report "still unobserved". **Never simulate one,**
  and never use permission settings UI as a substitute specimen.
- **S8 Scheduled tasks** — wherever they are managed (Activity panel and/or
  their own surface): creation/edit/cancel affordances and their labels.
- **S9 Goals & Ideas** — the product advertises goals and ideas; find their
  in-product surfaces from the nav: names, layout, what an item shows, what
  actions exist. Structure and labels only.
- **S10 Artifacts** — how artifacts a chat produces are presented in the
  client (panel? cards? a viewer?), and the labels used.
- **S11 Search** — the search surface (`hatch-nav-search`): what it searches,
  how results are grouped/labelled.
- **S12 Settings, connectors, permissions** — the surfaces' names and
  one-line structure each; in particular any per-connection approval
  defaults (labels only). Do not change any setting.

## Hard rules (same as calibration — they are not negotiable)

1. **No session material, ever.** No cookies, tokens, storage dumps,
   network captures, or credential anything — in the report, in commits,
   in screenshots, anywhere. If a step seems to require it, stop and say so.
2. **No owner content.** Never quote, transcribe, or screenshot the owner's
   conversations, messages, or personal data. UI vocabulary (labels,
   headers, button text) is fine and wanted; conversation *content* is not.
   Screenshots, if taken at all, only of a fresh test chat you created or
   of empty states — and prefer prose layout descriptions over screenshots.
3. **Read-only toward the owner's real conversations.** Do not open them,
   do not send in them, do not rename/pin/delete anything. All interaction
   happens in test chats you create for this survey; delete nothing.
4. **CAPTCHA or bot check → stop and hand to the owner.** Do not work
   around it.
5. Bridge and debug endpoints stay on localhost. Nothing in this survey
   needs the extension reloaded or the app run — it is observation of the
   client only. (If you do run the app to cross-check a label, the
   calibration report's ops notes apply: reinstall the extension after
   edits; restart bridge/preview if the session restarted them.)

## Deliverable

- `docs/UI-SURVEY-REPORT.md` on branch `feat/ui-survey`: one section per
  surface ID above, each closing with **"Desk implication:"** — one or two
  lines on what Mission Desk should mirror, adapt, or deliberately do
  differently, keyed to `docs/FEATURE-MAP.md`.
- Commit in small, labelled steps. **No push and no merge without the
  owner's word** — the owner relays and pushes as with calibration.
- When the survey is complete, close out in the room with: branch name,
  tip commit, and any surface that could not be observed and why.
- **Full text is welcome in the room, however long it runs.** There is no
  size pressure on that channel and no need to compress, summarize, or
  split findings into excerpts; they are read whole and folded into
  `docs/FEATURE-MAP.md`. The branch copy remains the durable record; the
  room is where the work gets discussed.
