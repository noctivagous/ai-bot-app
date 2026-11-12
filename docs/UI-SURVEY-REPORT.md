# UI survey report — muse.ai client surfaces (rendered)

Working-loop survey per `docs/muse-code-ui-survey-brief.md` (main @
8374169 — the version with "The working loop"), feeding
`docs/FEATURE-MAP.md` DRAFT v0.1. Structural facts reused from
`docs/survey/muse-ai-dom-survey.md` without re-surveying.
Branch: `feat/ui-survey`.

Rules held throughout: no cookies/tokens/session material; no owner
conversation content quoted (UI labels only); shell navigation and
test chats only, read-only toward the owner's real conversations;
approvals only if genuine, never simulated; no screenshots taken —
prose layout descriptions; no push/merge without the owner's word.

Status: S1 posted to the room; S2–S12 open.

## S1 — Shell & navigation

Layout, left to right: narrow icon dock rail
(`[data-testid="hatch-dock-rail"]`); wide center chat column
(header, message log, composer); right sliding status panel,
240–420px, own resize handle (separator "Resize panel",
min 240 max 420). The right panel persists across main views
(Feed/Ideas/Goals/Library) once opened ("Keep chat panel visible"
is checked in "Side chat options").

Dock rail, top to bottom: Chat (link, expandable, Meta+J — main
chat), Search (button, Meta+K), spaces-dock group Feed / Ideas /
Goals / Library (`DIV[role="button"]` in
`[data-testid="hatch-spaces-dock-rail"]`; testids are hex of the
names, e.g. `hatch-nav-system-item-66656564` = "feed"), then
Create a space, Get the Muse app, Settings (expandable, haspopup
menu). No `title` attributes anywhere — accessible names are the
tooltip text.

What they open (all full-page main views, rail kept):
- Feed (`/feed`): banner region "YOUR FEED PROMPT" (current prompt
  text, Edit with dialog, Generate), then log "Feed editions":
  cards with heading, relative time ("1h ago", "2d ago"),
  "Feed unit options" menu, summary with links, "View image full
  screen" on media, Love / Discuss actions; occasional embedded
  widget iframes.
- Ideas (`/ideas`): intro line, "Featured ideas" region of
  full-width idea buttons (title + description in the accessible
  name, each with "More options for …"), then H2 category regions
  of the same shape.
- Goals (`/goals`): banner "Goals" + "Goals options" menu;
  "Tracking" region of goal rows (checkbox "Mark … complete",
  live status region, goal button title + detail, "Goal options"
  menu), "Show 10 more"; "Create a goal" region with category
  buttons Health, Relationships, Finance, Career, Interests,
  Productivity, Something else.
- Library (`/library/artifacts`): left "Library navigation"
  (searchbox "Search the Library"; Files group Spaces/Documents;
  Media group Images/Videos/Podcasts; System files); banner +
  Select + "Sort spaces" (menu) + "Create a space"; "Recent"
  list rows (name, type, time, open button, "More options");
  "Quick Open" ("Search for a file to open").

Top bar in a side thread: Chat link, Call button; right side the
avatar/Kavi button that opens the status panel. There is NO
standalone Activity toggle in side-chat view: the panel opens via
the avatar button, and Activity / Approvals / Identity / Mail are
tabs in its header — Activity shows `pressed` when active — above
Close panel, avatar image, "Avatar options", name, "Connected".

Desk implication: keep our chrome, but adopt the rail grouping
(chat+search, product surfaces, create/app/settings) and the words
Activity/Search. The desk's adapter cluster should read as one
button the way their avatar-button-opens-panel does, and Board
zones should reuse the Activity/Approvals/Identity/Mail tab
vocabulary where the concepts match.

S1 probes (answered in the room): the in-panel Activity tab IS the
element calibration recorded (same placement, pressed while open);
closing the panel removes the tabs — no standalone unpressed toggle
exists in side-chat view. Rail is icon-only (one svg per item, no
text); hover shows a custom label+shortcut tooltip ("Chat", "⌘J"),
not `title` attrs. Search opens an overlay "Search Muse" dialog
(combobox + Suggestions listbox, Esc closes). Get the Muse app
opens a "Download apps" dialog (iOS/Android/Mac tabs, QR code,
Close). Settings menu: "Keyboard shortcuts ⌘/", "Download apps",
"Report an issue", "Settings ⌘,". Deliberately unobserved (bounds):
main-chat top bar, Create-a-space landing, Chat-link expanded
semantics beyond panel tracking.

## S2 — Conversation switching

The switcher is a persistent left "Side chats" navigator: Search
box, "Side chat options" menu ("Keep chat panel visible" checked,
"Show archived chats"), "Main chat" button, expandable "Side chats"
header, "New side chat" first, then one button per thread
(the `hatch-chat-switcher-trigger` dropdown of the brief/map
picture is absent in side-thread layout — null in both threads;
the navigator stands in its place). Rows show title + relative age
("3h", "6h", weekday "Mon"/"Fri", "just now") — correction: NOT
title-only; age renders in-row. The ACTIVE row adds a "More thread
actions" menu: Pin, Rename, Archive, Delete (listed only on my own
test chat's row, nothing invoked). Ordering recency-first is
inferred from age labels, NOT observed (no re-sort witnessed).
Searcher details: the Search box (name/placeholder "Search")
matches message content across chats — thread hits (title, age,
"Side chat" badge) and ellipsis-prefixed message-snippet hits.
Switching swaps the center column to `/thread/<id>`; rail,
navigator, and status panel persist. Selector survival verified
across a room→test-chat→room switch, both ends test chats I
operate in (no owner conversation opened at any point): scroll,
log+children, 10 message items, composer, name leaf, Activity
button/tab, panel, chatcol 4, vtpane 3 — identical in both
threads. (One transient: an aria-label Activity probe read zero in
the room right after navigating back from Library; present before
and after — render timing, so a probe must wait/re-check rather
than treat one zero as absence.)

Desk implication: map S2 adapt stands — records stay ours; mirror
recency-first order and the search box in the table defaults; the
client row menu (Pin/Rename/Archive/Delete) vs ours
(Open/Pin/Archive) suggests adding Rename behind a confirm and NOT
mirroring Delete.

## S3 — Chat & message presentation (fresh test chat, my content)

Date separator is a centered time-only pill ("6:16 AM"; older
formats unobserved). User messages: right-aligned pale-teal pills,
no visible name (the "You:" prefix is DOM-only; the agent name leaf
appears nowhere in the log — "Kavi" lives only in the panel
header). Per-message and per-group naming both absent from the
rendered log. Each user message carries More options / Copy
response / Reply. Assistant messages: short replies are small grey
chips, longer ones light-grey rounded cards; multi-part replies
stay in one card. Actions: React / Reply / More options. Code
block: language label, Download file + Copy Code icon buttons,
syntax highlighting. No timestamps anywhere; hover surfaces no
tooltip. Consecutive same-role grouping unobserved (structure
exists via data-message-grouped-with-next/previous). Distinction
is placement + container, not color or names.

Desk implication: map S3 mirror stands with one correction — the
client has NO per-message timestamps at all, so mirroring means
dropping ours, not demoting to hover. Show the "Kavi" name leaf on
groups, group consecutive messages, centered-pill separators,
placement + name distinction.

S3 probes (all in test chats): Shift+Enter inserts a newline, no
send (S4 blocker closed). Date pill is top-of-log per day, not
between exchanges; older-day formats unobserved. Name leaf is
panel-header-only here (inside the status-panel avatar card) —
calibration's avatar-stage twin is layout-dependent. User actions
verbatim: More options / Copy response / Reply; assistant:
React / Reply / More options. User More-options menu: Delete
only, listed never invoked. Assistant menu: Copy, Share. Chips =
1–3 word replies; cards = paragraphs/lists/code (exact boundary
unwitnessed). Corrections carried: name leaf on groups would be a
deliberate desk difference, not a mirror; mirroring timestamps
means dropping ours.

## S4 — Composer (same test chat)

Empty: placeholder "Message" + Attach file + Dictate a message
(+ mic affordance in some layouts), no Send. Non-empty: Send
appears, nothing else joins. Enter sends (verified twice).
Shift+Enter inserts a newline (verified, draft cleared after).
The client already materialises Send on text — parity input for
owner decision D1.

Desk implication: mirror the materialising Send (D1).

## S5 — Working signals (same test chat, mid-stream screenshots)

While generating: panel header "Kavi" + "Connected" becomes
"Kavi" + "is responding" (list icon); avatar switches to a headset
variant; composer Send becomes a dark square Stop button; reply
text streams progressively into the card. A panel entry appears
immediately (clover/progress icon + title + auto detail + time);
on completion the icon flips to check-circle, "Connected" and the
avatar restore, Stop reverts to Send. No spinner, no log status
text. Structural correlate: per-item DIV[aria-busy] true
mid-generation (node replacement, not mutation). Background
visibility: the unviewed working chat's row shows a blue dot +
"Unread updates" both mid-flight and after finish — seen-state,
not working-state; no distinct working badge at row level.

Desk implication: one "Kavi is working" grammar — is-responding
header + Stop control + running entry with progress→check icon
flip. Mirror Stop and the flip; map the desk pulse to progressive
text + header; treat "Unread updates" as seen-state.

S5 probes: with the panel closed, NOTHING says working — top bar
shows only the idle avatar chip. The named signal is panel-gated;
the always-visible grammar is stream + Stop. Stop's name is
verbatim "Stop"; clicking it stands the partial text unmarked,
clears the composer, and ends the panel entry with outcome
"Interrupted" (kept, distinct icon). Unmarked partials are a
finding. Every reply creates a panel entry (even one-word
replies) under the same "Today" day-group — no separate Running
section; state = icon (progress/clover → check) + outcome text.

## S6 — Activity panel (survey-context entries only)

Right slider 240–420px (same panel as S1). Header: Close panel,
avatar + "Avatar options", name, status line (Connected green dot
/ "Searching memories" / "is responding" + headset avatar),
icon-only tabs Activity (pressed) / Approvals / Identity / Mail.
Body: "1 scheduled task" header (expandable; heart-icon entry +
"Every 30 minutes" + "See all scheduled tasks"); day groups
("Today" expandable; Yesterday/dates same shape). Entry row:
status icon + bold title + auto detail + relative time. Running
vs history: same list, icon flips progress→check (or stopped
icon + "Interrupted"). Expansion opens a detail DIALOG (not
inline): heading status-word + title ("Complete ..."/"Error ...",
description "Interrupted"), Close, step log (Started, tool steps
with queries + result counts, Completed + Summary / Interrupted
close). The dialog exposes raw internal tool traces (memory
queries, result counts, store refs) — observed, not endorsed.
Boundary: only test/survey entries expanded; scheduled entry
row-form only; no owner content quoted.

Desk implication: map S6 adapt stands — Running Now / Recently
Finished is our grouping invention over one day-grouped list
(D2 input, owner's call). Mirror icon-flip + outcome-text state
language, entry row shape, step-log detail idea — but NOT raw
internal tool traces.

S6 probes: dialog pairings pinned — row outcome "Interrupted" →
dialog heading "Error <title>" with description "Interrupted",
body opens on the status word then the step log; finished rows →
heading "Complete <title>", step log closing on "Completed" +
"Summary". Status-line vocabulary witnessed: Connected (green
dot), "Searching memories", "is responding" (list icon) — working
phases only, no others seen. Example test row, verbatim (my
content): "Explain send button states / Explained empty, typing,
sending, sent, and error states / 6:19 am" — titles are
agent-summarised task names, details auto past-tense summaries.
Client inconsistency recorded: dialog conflates Interrupted with
Error while rows keep them distinct — desk keeps "Interrupted"
throughout (deliberate difference, owner settles in map).

## S7 — Approvals

Still unobserved at survey time: no genuine approval request
occurred in any test chat; nothing simulated; the Approvals tab
was not treated as a specimen. Carried as unobserved to closeout
unless a genuine request appears.

## S8 — Scheduled tasks (row-form + management dialog only)

"See all scheduled tasks" opens a "Scheduled tasks" DIALOG (not a
view): Close, H2 "Scheduled tasks", H3 day-group "Daily", one
entry row button per task ("<title> / Every 30 minutes" shape:
heart icon, title, cadence; owner's title redacted, cadence
pattern kept) — no tabs, no inputs, no create affordance anywhere
in it. Entry detail dialog: H2 with the task title, Close,
cadence text, "Run history" (expandable; on reopen rendered
expanded showing run rows of status word + kind + time each —
row shape only, values not quoted), "See more", "View
permissions", "Delete". No edit/cancel/pause/resume affordance
exists in either dialog — confirmed on reopen: the management set
as observed is exactly Run history, See more, View permissions,
Delete, nothing else. Nothing invoked; "See more" and "View
permissions" destinations left unobserved (likely owner task
detail/permissions). Creation AND edit both unmapped — a thinner
management surface than the map assumed, which is itself the
finding. Desk note: Delete lives one level deep in the detail
dialog, not in-row; whether the client confirms before deleting
is unobserved (Delete must never be invoked here), so a desk
confirm is a desk choice with no client evidence either way —
phrase it that way, not as mirroring. Time-format note: the
example-row time in the room post read "6:35 am" in error; the
entry and this report carry the correct "6:19 am" — single entry,
no duplicate.

Desk implication: mirror the management dialog shape (day-grouped
task rows) and the entry affordance labels; creation flow stays
unmapped until observed.

S8 detail: the "Scheduled tasks" dialog has NO create affordance,
no tabs, no inputs — H2 + Close + H3 day-group + entry rows
only. Creation entry point unobserved anywhere in the UI
(possibly chat-driven; not chased by creating one).

## S9 — Goals & Ideas (item anatomy + actions; structure/labels only)

Ideas (`/ideas`): H1 "Ideas" + intro line ("always thinking"
framing); "Open side-by-side chat" button. A "Featured ideas"
region, then H2 category regions (witnessed: Financial
Management, Productivity, Relationships, Health & Fitness,
Shopping). Each idea = one full-width BUTTON (title + description
in the accessible name) + one adjacent "More options for …"
button. Idea "More options" menu (labels only, invoked nothing):
"Let's do it" / "More like this" / "Not interested". No owner
idea titles or descriptions quoted here.

Goals (`/goals`): banner "Goals" H1 + "Goals options" menu; H2
"Tracking" region of goal rows: checkbox "Mark <title> complete"
+ live status region + goal button (title + detail in the
accessible name) + "Goal options" menu; "Show 10 more" button;
H2 "Create a goal" region with category buttons Health,
Relationships, Finance, Career, Interests, Productivity,
Something else (not started — categories already observed).
Goal-row "Goal options" menu (labels only, invoked nothing):
"Discuss" / "Rename" / "Add subgoal" / "Complete" / "Delete".
Banner "Goals options" menu: menuitemcheckboxes "Show subtitles"
(checked) and "Sort automatically", plus "Completed goals" —
"Completed goals" left unvisited (invoking it was out of bounds),
so completed-state vocabulary stays unobserved. No checkbox
ticked; no owner goal titles or details quoted.

Vocabulary finds: the goal detail line under each title is
called "subtitles" in client terms ("Show subtitles" toggle);
row actions use Discuss/Rename/Add subgoal/Complete/Delete
(compare thread rows' Pin/Rename/Archive/Delete — no Archive
here, Discuss and Add subgoal instead). "Parked" appears
informally inside owner detail prose, but parked/completed STATE
vocabulary is unobserved (no state
badges or tabs witnessed on rows) — D3 input stays the owner's;
documenting form only, never deciding parked/un-parked.

Desk implication: mirror the goal-row shape (complete-checkbox +
title + subtitle + options menu) and the action-label set
Discuss / Rename / Add subgoal / Complete / Delete; mirror the
idea-row shape (full-width button + More options with Let's do
it / More like this / Not interested) if the desk ever carries
suggested items. "Show subtitles" gives the client word for a
detail line the desk already renders — adopt "subtitles" if it
names the same thing.

## S10 — Artifacts / Library (structure + labels; no owner file or space names quoted)

`/library/artifacts` (Spaces view): left "Library navigation"
(searchbox "Search the Library"; H3 "Files" with links Spaces,
Documents; H3 "Media" with links Images, Videos, Podcasts;
"System files" link); banner H1 "Spaces" + "Select" + "Sort
spaces" menu + "Create a space" (not triggered — creation flow,
out of bounds). H3 "Recent" list: each row is name + type +
"·" + age, exposed as one row button (name + type + age in the
accessible name) + a "More options" button. Recent-row "More
options" menu (labels only, invoked nothing): "Move to sidebar"
/ "Pin" / "Share" / "Download" / "Delete". H2 "Quick Open"
("Search for a file to open"). Videos, Podcasts, and System
files destinations unvisited — nav labels known, interiors
unobserved.

`/library/media?view=images`: banner H1 "Images" + "Create an
image" (not triggered); the body is a grid of image buttons
(file names as accessible names — not quoted). No image opened
(owner media, out of bounds).

`?view=documents`: banner H1 "Documents" + Select + "Sort
spaces" + "Create a document" (not triggered); empty state H2
"No documents yet" — empty-state vocabulary captured.

Age-format addendum (closes the S2 open question): Recent rows
show relative hours ("11h ago"), weekday names, and month-day
dates ("Nov 2" style) for older items — three tiers witnessed,
no owner rows quoted. Scope note: the third tier is witnessed
for the client's age vocabulary generally, from Library rows;
on a thread row specifically it remains analogy, not direct
witness, since no older thread row was seen.

S10 confirmation: no in-chat artifact presentation was observed
in any test chat — nothing any test chat produced rendered as a
panel, card, or viewer; the code block's Download file is a
message-block control, not an artifact surface. The Library is
the only artifact surface witnessed. "Sort spaces" was never
opened anywhere — stays unobserved.

Desk implication: mirror the Recent-row shape (name + type +
age + options) and the file action-label set Move to sidebar /
Pin / Share / Download / Delete; the empty-state H2 pattern
("No documents yet") is worth mirroring for empty desk lists.

## S11 — Search (dock overlay + switcher box; my terms only quoted)

Two distinct searches, kept separate as established in S2.

"Search Muse" dock overlay (Meta+K): H2 "Search Muse" dialog,
combobox + "Clear search" button once text is entered,
listbox "Suggestions". Query "add function" (my own test-chat
term) returned 13 flat options — no group headings in the list
(no role=group / command-group headings; one option pre-selected).
Option shape: thread hits carry title + snippet + relative age
("… ·47m ago" pattern); message hits carry snippet text.
A trailing action row reads "<query> / Send message to Kavi"
(a query-to-chat command row, not a result). Owner results seen
in the list are reported grouping/labels only — no titles or
snippets quoted; my own hits confirmed the option shape.
Escape closes the dialog.

Switcher "Search" box: typing "add function" filters the Side
chats navigator in place into two result kinds — one thread hit
first (title + age + "Side chat" badge; my own "Create Python
add function" thread read "… 33m Side chat"), then
ellipsis-prefixed message-snippet rows ("…<snippet> <age>
<thread title>"; my own room/test-chat snippets confirmed the
row shape). Owner snippet rows seen during the query are
reported as row-shape only — no snippets or titles quoted.
A "Clear search" button appears while a query is active.

Desk implication: mirror the two-search split (global overlay
vs in-list filter); mirror the switcher's two result kinds
(thread hits with badge, ellipsis-prefixed snippet hits with
owning-thread label) and the trailing query-as-command row if
the desk's search takes actions as well as results.
