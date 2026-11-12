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

While generating: panel header shows "Kavi" + "is responding"
(list icon) replacing "Connected"; avatar switches to a headset
variant; composer Send becomes a dark square Stop button; reply
text streams progressively into the card (caught mid-sentence).
A new panel entry appears immediately with a clover/progress icon
+ title + auto detail + time; on completion the icon flips to a
check-circle. On finish: "Connected" + green dot restored, avatar
normal, Stop reverts to Send on the cleared composer. No spinner,
no separate status text in the log. Structural correlate:
per-item DIV[aria-busy] toggles true mid-generation (nodes appear
replaced, not mutated).

Desk implication: one "Kavi is working" grammar — header line +
Stop control + running entry with a distinct progress icon that
flips to check on completion. Mirror the Stop affordance; map the
desk pulse to their progressive text + is-responding header.
