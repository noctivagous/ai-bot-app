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
