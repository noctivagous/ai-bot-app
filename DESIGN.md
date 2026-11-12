# ai-bot-app — Design

Version: v0.1 (draft for the owner's judgment, 2026-11-11)
Status: **design only — no build authorised by this document alone**
Repo: `noctivagous/ai-bot-app` · seed commit `0a378ee` · local checkout `~/workspace/ai-bot-app`

Sources, in order of authority:

1. `nct-ai-botApps.txt` — the owner's brief (what the app is)
2. `Nct+Botapps+Desktop+Pro/App.tsx` (722 lines) + `index.css` — the Meta AI
   webartifact prototype (how it looks and is laid out; placeholder data and
   fake actions)
3. `webartifact transcript.txt` — what the prototype claims to implement
4. The owner's directions in chat, 2026-11-11 (adapter choice, sequencing,
   no capability cap) — §2.3

---

## 1. What this app is

A customizable, general-purpose **bot app**: a desktop-style home for one or
more bots, in which chat is one surface among several, not the whole product.

From the brief:

- A mixture of procedurally updated widgets and stationary dashboard widgets
  alongside the chats. Bot activity does **not** have to happen in the chat
  log: it can be visible in stationary widgets next to the chat flow. Widget
  activity is **transient data, not logged** — that is the point; following a
  chat log for everything is exhausting.
- Each bot can have **Dashboard** and **Control Panel** pages alongside its
  Chat Log page. The Control Panel is a command surface outside typed
  commands: buttons the bot sets up for the user to click, and forms the bot
  makes, where the user enters data and the bot receives the command.
- Other built-in pages: schedule visible as a **Gantt chart or calendar**
  (everything the bot has scheduled), **task lists / Kanban**, an **address
  book / contacts**, a built-in **email client**, and **WebView tabs** — bots
  open web pages inside app tabs instead of an external browser.
- Bots use the app's **own modules** (calendar, Gantt, Kanban, tasks,
  contacts, email) rather than relying on connectors to external services —
  or at least use synced data from such services *through* the app's modules.
- **Global resource modules** sit at app level: monitor modules, email
  accounts, remote databases. They emit callbacks that go to bots; the user
  can connect a global resource to individual bots; a resource is *known by*
  all bots even when connected to only some.

The prototype renders all of this for four placeholder bots (GH‑01
Greenhouse, LAB‑02 Lab Sampler, FLD‑03 Field Monitor, INB‑01 Inbox Router):
left sidebar (global resources + bot list), per-bot tabs (Chat Log 60% +
stationary live rail 40% / Dashboard / Control Panel / Schedule / Tasks /
Email / WebViews), dark pro styling with sharp 2px radii. Its chat send,
control actions and live values are fake; its one real contract is a
persistence call shape — `records.list` / `records.create` against a
collection (prototype uses `nct_events`).

## 2. Direction and sequencing

### 2.1 A service-adapter app, not a client clone

The app will contain **adapters to client services**. An adapter connects the
app to one bot service and *drives the app* through a single, service-neutral
interface (§4–§5): the app core renders and acts only on what adapters
supply. The app is not a pixel-mapping of any one client, and it is not
limited to what a client exposes — it has capabilities of its own (its
pages, modules and widgets in §1), and adapters can be added for other
services and APIs in the future.

**For now there is exactly one planned adapter: the Muse AI web client**
(muse.ai — the owner's personal Muse agent, "Kavi"). No other adapter is
designed beyond the interface it must fit.

### 2.2 First goal

> Set up the app for the Muse AI web client and have the service adapter
> drive the app.

Everything else — in particular chat driving dashboards (§10) — is built on
top of a working adapter, not before it.

### 2.3 No capability cap, explicit order

The owner has clarified: we are **not limiting what the app can do**. In the
brief the chat can drive dashboards, and that *is* wanted. The order is a
sequencing decision, not a scope decision:

1. Adapter status working (MockAdapter first — this document's focus, §7–§8)
2. Adapter messages / actions working against the mock
3. The real Muse AI adapter working (extension, §9)
4. Chat-driven dashboards and the app's own modules (§10)

### 2.4 The fuse choice: B (extension)

Bridging to muse.ai is unsupported and brittle, and the owner accepts that.
Checked facts about muse.ai that constrain the design (2026-11-11):

- It cannot be iframed: `X-Frame-Options: SAMEORIGIN` and CSP
  `frame-ancestors 'self'`.
- Its live transport is WebSocket (`wss://gateway.meta.ai`,
  `wss://edge-chat*.meta.ai`, `wss://shortwave.meta.ai` in its CSP), which
  is undocumented.
- Its CSP `connect-src` does allow `ws://localhost:7700` and generic `ws:` /
  `wss:`, so code running *in* the page can talk to a local bridge.

Three fuse routes were considered: **A** Playwright driving a logged-in
browser, **B** a browser extension / content script inside the muse.ai page,
**C** reverse-engineering the WebSocket protocol. **Decision: B, for now.**
A remains the fallback if the extension route dies; C is a possible later
optimisation, never v1.

### 2.5 Why this app exists — a real shell for a capable agent

The owner's judgment, recorded as the project's rationale (2026-11-11):
the Muse AI client is hard to use for serious jobs, or really for
anything much. Its UI is little developed and confusing, and it is shaped
like a mobile app, very reduced: sparse, with almost nothing to help you
get organised. Its goals are different — it reads as a vague plaything
next to the agent it fronts.

And it *is* only a front. What is behind it is genuinely strong, and the
app is being built first to interact with Muse AI in order to keep
exactly those strengths:

- **It already manages a VM** — a persistent, dedicated computer (with a
  browser, storage and tools) that stays with the agent between
  conversations.
- **It carries out huge tasks on its own** — long-running, multi-step work
  from a single direction.
- **It generates web artifacts** — real pages and apps as deliverables,
  not just text.
- **It manages the agent's memory** — durable, curated memory of the
  user, their people, projects and decisions, maintained across
  conversations (and in the background between them), so work resumes
  where it left off without the user re-briefing.
- **It can search things** — full-text search across chats, and search
  over memory, artifacts, files and goals, plus web and connector
  search through the agent.

And beyond those headline strengths, a lot of plain engineering is
already done and working: connectors to real accounts, scheduling and
proactive background work, an approvals/permissions system, artifact
hosting and data, a browser the agent can drive, paired devices. None of
that is trivial, and little of it is what is wrong with the product.

**Design consequence — reuse, don't rebuild.** This app does not
re-implement memory, search, scheduling, connectors or artifact
hosting. It *surfaces* Muse's, through the adapter: Muse's search
becomes the app's search across conversations; Muse's memory stays the
one memory (the app never grows a second, competing memory of bot
content — its own store holds only the app's organisation: projects,
statuses, and links between chats, goals and artifacts); Muse's
scheduled work is what the Schedule page renders. Where the brief asks
for the app's own modules (its own calendar/tasks/contacts), they are
organisation surfaces over data that may originate in Muse — the line
is: Muse owns the agent's mind and machinery; this app owns how a
person looks at and arranges the work.

The gap is that none of that is *legible or organised* in a reduced chat
client: huge autonomous tasks arrive as a scrolling log; scheduled work,
goals, approvals and artifacts have no real home. This app is the missing
desktop-grade shell — no accident that the prototype literally calls
itself a Bot Apps *OS*. Its pages and modules (§1) exist to give the
agent's work organisation — dashboards instead of a log, a schedule
instead of a memory test, an artifacts/webview home instead of links in a
stream — while the VM, the task execution and the artifact generation
stay Muse's job, behind the adapter.

### 2.6 Predominant Modes

The app is organised by **Predominant Modes**. A mode is not a tab, and
it is not an adapter:

- A **tab** is a page inside a bot (Chat, Dashboard, Schedule…).
- An **adapter** (§5) is how one bot service connects.
- A **mode** is which engine/world currently predominates. Switching mode
  re-orients the *whole app* — which bots exist, which pages and panels
  are present, what the inspectors reflect — while the app-owned modules
  (§1: widgets, schedule, tasks, contacts) persist as the common home.

This is the pattern the owner explored in the "SPA GUI layout
alternatives" discussion and its historical follow-up: master-detail and
the three-column shell assume hierarchy is a tree, selection is stable,
and chrome is always visible — the older, more varied GUI tradition
dropped those assumptions. Modes in the FileMaker sense (Browse / Find /
Layout / Preview), Dreamweaver's Code / Split / Design, iLife's
single window that morphs by mode, and a selection-reflecting inspector
(Flash's Property Inspector) are the ancestors here; "Rooms / Worlds"
(world switch swaps the whole state tree) is the layout form a mode
switch takes. Composition follows the mode, not the other way round.

Two modes are named. Only the first is designed:

1. **Muse AI Mode** (first, predominant at launch) — the world behind
   the active adapter is the owner's Muse agent on its VM. Bots are
   Muse agents (Q1: one bot, conversations inside it); what the mode
   must make legible is precisely Muse's strengths (§2.5): autonomous
   work in flight (Activity / Upcoming / Approvals as stationary
   widgets, not log), goals, generated artifacts as a first-class module
   the bot can open in WebViews, and scheduled work on the Schedule page.
2. **API / Tool Chat Mode** (future, *not designed*) — a predominant mode
   in which the chat is driven directly by API requests and tool
   requests: the app (or its harness) owns the model calls, the tool
   registry and the keys, much as ALE's original engine did. How it will
   look is **not known yet and is not guessed here**. What v0.1 reserves
   for it, and only this:
   - mode is top-level app state (`modeId`); a mode switch swaps the
     bot/service state tree while app modules persist;
   - adapters register *into* a mode, so a future API/tool adapter does
     not have to pretend to be a web-client fuse;
   - pages and capabilities declare the modes they exist in, so a page
     that makes no sense in a mode is absent there rather than disabled.

The prototype (§1) is, in the owner's words, **the general feel and
composition** of the app — the pro desktop register, the sidebar +
bot + tabs + stationary rail arrangement as a starting composition for
Muse AI Mode. It is not a pixel spec, and it does not bind whatever
API / Tool Mode eventually looks like; modes are free to rearrange the
composition, as the SPA-alternatives work suggests they should.

### 2.7 The organisation layer — four things that get a home

The owner confirmed this sentence as the summary of what the app is for
(2026-11-11): *every piece of bookkeeping the user currently routes
through the agent because the client has no home for it gets a home —
projects with status, work in flight on a dashboard, approvals and
schedule where you can see them, artifacts attached to the bot and the
goal that produced them.*

Those four are first-class in Muse AI Mode, and each has a defined
source and owner — per §2.5's rule, Muse supplies the substance, the
app supplies the arrangement:

1. **Projects with status.** A project is an app-owned grouping — the
   unit the client doesn't have. It links conversations, goals, repos
   and artifacts that belong together (e.g. ALE; NibGlider; StrokeCore;
   this app). Status is a real field with a small vocabulary
   (`active / awaiting-owner / blocked / parked / done`), shown wherever
   the project appears, and it is the answer to "what's outstanding?" —
   a question the client itself cannot answer. Status lives in the
   app's store (§2.5); the bot may *propose* a status change through the
   adapter, the app records it.
2. **Work in flight, on a dashboard.** Turns in progress, background and
   scheduled runs, and waiting items across *all* of the bot's
   conversations, aggregated on the Dashboard and the stationary rail —
   as state, not as log. In Muse terms this is the Activity /
   Upcoming material that the client hides behind an avatar tap,
   promoted to a surface. Source: adapter `activity` events + adapter
   status; a finished item leaves the dashboard for the project's
   history, it does not scroll away in a chat.
3. **Approvals and schedule, visible.** Approvals are never buried:
   a pending approval appears in the rail's Attention card and on the
   Dashboard at bot level, whichever conversation raised it, and
   resolving it there is the resolution (§9). Schedule — Muse's
   upcoming/scheduled work plus the project's own — renders on the
   Schedule page (Gantt/calendar, §1), so "what's about to happen" is a
   place, not a question you have to ask in chat.
4. **Artifacts with provenance.** Every artifact/space/document the bot
   produces is listed in the app *attached*: to the bot that made it,
   the conversation it was made in, the project it belongs to, and the
   goal it serves — the four links the client's Library grid severs.
   Muse remains the host (§2.5); the app's store holds the links, and
   an artifact opens in a WebView tab in context, next to its project,
   not in an undifferentiated grid.

These four are the acceptance shape for Muse AI Mode's later slices
(§11, slices 6–7+): a slice that adds a chat feature without giving its
results a home in one of these four is incomplete by this design.

### 2.8 Chats are not a list — conversations live in our database

The client's only organisation for conversations is a flat,
reverse-chronological sidebar: no projects, no tags, no status, no
filing — searchable, and that is all. Roughly thirty are visible before
scrolling, and a chat's title is generated once, from its opening, and
never updated — so a thread that became the StrokeCore calibration
discussion still wears whatever its first message suggested. At the
user's working scale (dozens of live threads across many projects,
software and otherwise) that list is not a filing system; it is a pile
with a find function (owner, 2026-11-11).

So in this app, **a conversation is a record in the app's own
database**, enriched with organisation the client never gives it:

- `projectId` — the project (§2.7) it belongs to; a conversation the
  adapter reports with no project lands in an **Unfiled** tray for
  triage instead of polluting the list.
- `tags` — free tags, user- and bot-assigned.
- `status` — `active / waiting-on-owner / waiting-on-bot / parked /
  done`, so "which of my threads need *me*?" is a filter, not a memory
  exercise.
- `title` — **owned by the app**: renameable, and the bot may propose a
  retitle when a thread's topic has drifted from its name (the direct
  answer to "the names aren't updated"). The client's title is just the
  initial value.
- `pinned`, `archived`, `lastActivityAt`, and links to its goal and
  artifacts (§2.7).

The sidebar renders *from this database*: grouped by project, filterable
by tag and status, complete rather than windowed — not a mirror of the
client's scroll list. The adapter's job stays narrow: report the
conversations that exist and their activity; filing them is the app's.

**General purpose, not a dev tool.** Today's centre of gravity is
software work — a great many git pushes and repo interactions — so a
project carries a `kind` (`software | book | research | general`, open
vocabulary) and a software project shows repo state, including an
*awaiting-push* queue across projects (branches built and gated, held
for the owner's word — today invisible in the client, a standing fact
of this user's workflow). But the core — projects, conversations,
dashboards, schedule, artifacts — is domain-neutral. The worked
non-software example is the user's Chinese book: a `book` project whose
tasks are chapters, whose artifacts are the interactive map/timeline
and the book app itself, whose store of record is a project bible —
same four homes (§2.7), no git anywhere. Future kinds plug into the
same shape; nothing in the mode's core may assume code.

### 2.9 Organisation is something you do yourself — manual-first

The deeper failure underneath §2.8 (owner, 2026-11-11): in the client
you cannot organise things *yourself* at all. There is no folder to
make, no tag to apply, no chat to file, no view to arrange — the only
organisation that exists is the system's (recency order, auto-generated
titles), and the user is a spectator of it. An app used for a variety of
things is useless without self-organisation, whatever its agent can do.

So in this app, **every organisational act is direct manipulation,
available without asking the bot in chat**: create / rename / delete a
project; file a conversation into a project (menu or drag); tag and
untag; retitle; pin; archive; set a status; rearrange the dashboard and
the stationary rail; save a filter as a view. The bot may *propose* —
a filing for an unfiled chat, a retitle when the topic drifted, a
status change when work lands — but a proposal is accepted or rejected,
never silently applied, because the filing system belongs to the user,
not to the agent. (This is also the brief's first word made concrete:
*customizable* — the user arranges the app around their work, not the
other way round.)

### 2.10 Multitasking is the normal case

The owner works in parallel (2026-11-11): several chats — up to about
three — running different tasks at the same time, while he switches
between them to check their status. In the client this is barely
supported: background work does not surface (its progress hides in the
Activity view; the header says only "Connected", where it once said
what was happening), so checking status means opening each chat and
reading it — polling by hand. Design consequences:

- **Every conversation carries a live state**, visible wherever the
  conversation appears (sidebar row, project view, dashboard):
  `running` (with a one-line *what it's doing* and elapsed time),
  `waiting-on-owner`, `waiting-on-bot`, `idle`, `done-unread`. Running
  is a state of the conversation record (§2.8), fed by adapter
  `activity` (§5); it is never inferred from which chat is open.
- **Work in Flight is the multitasking board** (§2.7 item 2): all
  running conversations across all projects, at a glance, without
  opening any of them. The stationary rail shows it beside whichever
  chat is open; the Dashboard shows the full table.
- **Finishing is an event, not a discovery.** When a background
  conversation completes or blocks on the owner, it surfaces: unread
  badge on the conversation, an entry in Attention, a toast. The owner
  learns of completion when it happens, not when he next polls.
- **Switching never blocks.** Opening, reading or sending in one
  conversation does not pause, queue behind, or visually freeze the
  others; sends are per-conversation (§5's `clientMsgId` idempotence
  exists partly for this).
- **Project and bot aggregates roll state up**: a project row shows
  "2 running · 1 waiting on you", so the scan order is project →
  conversation, not a flat list scan.
- **Muse's own Activity view is the source of record** (owner,
  2026-11-11): the client's Activity view already lists *active* and
  *past* activities, and each activity opens to a detail of what it
  is/was doing. The adapter mirrors exactly that structure (§9): the
  content script reads the Activity panel's entries as `activity`
  events carrying title, state and **detail** (the working indicator /
  streaming signals are the fallback source). In the app, every
  Running Now card *expands* to that detail — "what is it doing" is
  one click, in place — and past activities land in a Recently
  Finished list on the Board (feeding project history), not only in a
  toast. What the client buries behind an avatar tap becomes the
  board's top layer, with its detail intact.

### 2.11 Composition decision — Mission Desk (owner, 2026-11-11)

Two prototype artifacts were built and judged: "Bot Apps OS" (the seed
prototype's composition, generalised) and, at the owner's request, a
second built from scratch from this discussion alone, "Mission Desk".
The owner chose Mission Desk: **"yes build this."** Its composition
supersedes the seed prototype as the app's UI direction for the repo
build (the seed remains the brief's source for capabilities, §1 — pages
and modules it names are realised in Mission Desk's arrangement, not
its layout):

- **Board first, chat second.** The home screen is the Board, not a
  chat: project desk-card rail (status lamps, rollups, click to scope)
  → **Needs You** (approvals, waiting-on-owner, finished-unread) →
  **Running Now** (parallel job cards) → Projects at a Glance +
  Coming Up.
- **Conversations is a database table**, the filing system as a view:
  inline rename, in-row project select (changing it is the filing),
  tags, status selects, pin/archive, bot-proposed retitles with
  Accept/Reject, Inbox tray for unfiled.
- **Chat is a focus panel** sliding over the board; the board (and the
  other running jobs) stays visible behind it.
- Views: Board · Conversations · Schedule · Artifacts (+ viewer
  slide-over with provenance). Adapter status lives in a top-strip
  lamp cluster with a connection popover (the §7 surfaces, re-homed:
  pill → lamp cluster, drawer → popover; gating/system-line rules in
  §7 unchanged).
- Identity: graphite + signal-amber instrument panel, shaded depth
  system (§2.9-era shading direction, now native): raised controls,
  sunken wells, states by appearance.
- Q1 is settled in this composition's form: the app is organised
  around the one agent's work; there is no bots list in Muse AI Mode.
  A bots list returns only if a future mode/adapter brings genuinely
  distinct bots.

Slices (§11) proceed under this composition: the Slice 1 status work
(§8) is unchanged in substance — its surfaces are the lamp cluster and
popover above.

### 2.12 What Meta's official feature list adds (checked 2026-11-11)

Kavi read the official feature page (ai.meta.com/muse) after the owner
asked whether it had been consulted — it had not; the design until
then rested on lived use. The page confirms §2.5's strengths (Secure
VM with a *shared* browser the user can intervene in; goals turned
into action plans with tracked progress; connectors; an agent that
keeps working in the background after the app closes) and its FAQ
confirms the approvals model this design mirrors (Muse asks before
sending messages, making purchases or sharing information; the user
may allow *once*, *always allow*, or deny, with per-connection
defaults). Four things the page names that this design had not fully
taken up, recorded here so later slices pick them up deliberately:

- **Ideas are a first-class Muse concept** (goals *and* ideas:
  the agent comes back with suggestions "ready to act on under your
  direction"). In this app, Ideas belong in the same proposal pattern
  as retitle/filing proposals (§2.9): an Ideas queue the user accepts
  or dismisses — never auto-acted. Candidate source for the adapter:
  the client's Ideas surface, mirrored like Activity (§2.10). Later
  slice; not in the 2–7 build.
- **Monitoring is a Muse behaviour** (watching prices, weather,
  "things you care about", alerting on change). That is precisely the
  brief's *monitor modules*: Muse's monitors are a resource kind in
  the §10 resources registry (slice 7 seeds the registry; monitor
  data flows are a later tranche).
- **Approval scope is part of an approval**: `approval.request`
  carries the scopes the page offers (once / always) when present,
  resolution passes the chosen scope, and Needs You shows which scope
  was chosen. (Folded into slice 6 at authorisation.)
- **Other surfaces exist and stay other surfaces**: Muse is also
  reachable via WhatsApp and voice, and there is a Mac desktop app
  that "works with your desktop computer files, apps and browser
  tabs". Muse AI Mode here remains the web client (fuse B); a
  conversation's origin surface is just metadata on its record
  (§2.8) when the adapter can see it. Skills — Muse "builds its own
  tools" and ships skills — get no surface in v1 of this app; a
  Skills module is a plausible later app module (§10), informed by
  ALE's skills panel. Also noted: Muse is free with a usage limit —
  usage/limit state is a plausible future line in the connection
  popover, not a check.

## 3. Architecture at a glance

```text
┌──────────────────────────── ai-bot-app (this repo) ───────────────────────────┐
│                                                                                │
│   App core (React/TS)                                                          │
│   ├─ Pages: Chat+Rail · Dashboard · Control · Schedule · Tasks · Email ·      │
│   │         WebViews · Global Resources                                        │
│   ├─ App modules: schedule/gantt · kanban/tasks · contacts · email · widgets   │
│   └─ Adapter host: registry, status store, event router, command dispatcher    │
│                                  ▲            │                                │
│                    BotEvent (§5.2)│            │ commands (§5.1)               │
│                                  │            ▼                                │
│   BotServiceAdapter interface (§5) ────────────────────────────────────────    │
│        ├─ MockAdapter        (in-process, scripted — built first)              │
│        ├─ MuseAiAdapter      (extension + local bridge — §9)                   │
│        └─ (future adapters — interface only)                                   │
└────────────────────────────────────────────────────────────────────────────────┘
                                      │  (MuseAiAdapter only)
                        local bridge  ▼  WebSocket, localhost only
                        extension: background + content script in the muse.ai tab
```

Rules that hold the shape:

- **The core knows no service specifics.** No `muse.ai` strings, selectors,
  or protocol shapes outside `MuseAiAdapter`. (Same discipline as ALE
  translating OpenCode / Muse Code into one `ChatStreamEvent` union so its
  UI never changes per engine.)
- **All bot presence, conversation and action flows through the adapter** —
  commands down, events and status up. A page that reaches around the
  adapter to fake data is a design violation; the prototype's fake data is
  re-homed *behind* MockAdapter (§8.1), not copied into pages.
- **Status is its own channel** (§6), separate from chat events. This is
  deliberate: the brief says transient activity should not clog the chat
  log, and connection churn is exactly that kind of activity.
- **Capabilities, not assumptions.** Pages ask the active adapter's
  capability flags (§5.3) what to enable. A future adapter without
  approvals simply renders no approval surface.

## 4. Core concepts the adapter must supply

| App concept (prototype today) | Adapter-supplied form |
|---|---|
| Bot list (`BOTS`, hard-coded, with `status`) | `listBots()` → `BotSummary[]`, each with its own derived presence (§6.4) |
| Chat history (`INITIAL_MSGS` per bot) | `openConversation(botId)` → `ChatMsg[]` snapshot, then live `BotEvent`s |
| Send (`send()`, fake 600 ms reply) | `sendMessage()` command; reply arrives as `BotEvent`s, never as the command's return value |
| Control actions (`triggerControl()`, toast + system line) | `invokeAction()` command; acknowledgement arrives as an event |
| Live rail values (1.2 s local tick) | `activity` events — transient, rendered in widgets, **not** written to the chat log |
| Connected resources (hard-coded pills) | Part of status (§6): the checks/resources the adapter reports for the selected bot |
| Persistence (`records.*`, `nct_events`) | App-owned, **not** adapter-owned. Adapters are live channels; the app's store keeps what the app keeps. Adapter *status* is never persisted (§6.5) |

Open mapping question this raises for the real adapter — one Muse agent,
many chats — is Q1 in §12. The mock sidesteps it by construction; the
interface does not (a bot is an adapter-level identity, a conversation
belongs to a bot).

## 5. The adapter interface

TypeScript sketches. Names are proposals for the owner's judgment; the
*shape* (commands down, events + status up, capabilities across) is the
decision this document asks for.

### 5.1 Commands (app → adapter)

```ts
interface BotServiceAdapter {
  readonly meta: AdapterMeta;               // id, display name, version
  connect(config?: AdapterConfig): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): AdapterStatus;               // §6 — snapshot, always available
  onStatus(fn: (s: AdapterStatus) => void): Unsubscribe;
  onEvent(fn: (e: BotEvent) => void): Unsubscribe;

  listBots(): Promise<BotSummary[]>;
  openConversation(botId: string): Promise<ChatMsg[]>;
  sendMessage(botId: string, text: string, clientMsgId: string): Promise<void>;
  invokeAction(botId: string, action: SurfaceAction): Promise<void>;
  resolveApproval(botId: string, approvalId: string, decision: 'allow' | 'deny'): Promise<void>;
}
```

Command contract:

- A resolved promise means **accepted**, not **completed**. Completion,
  replies and side-effects arrive as events. (`sendMessage` resolving does
  not carry the bot's reply.)
- A command the current status forbids rejects with a typed
  `AdapterCommandError { code: 'not-ready' | 'unsupported' | 'gone', phase,
  message }` — never a silent no-op, never a raw string. The app surfaces it
  (toast + draft preserved, §7.3).
- `clientMsgId` makes sends idempotent: a retried send with the same id is
  the same message. (Learned from every chat bridge we have built; cheap
  now, painful later.)
- `resolveApproval` exists in the interface from the start even though the
  mock only simulates approvals and the Muse adapter reaches them in a
  later slice — adding it later would break every adapter.

### 5.2 Events (adapter → app)

```ts
type BotEvent =
  | { kind: 'message.user';      botId: string; msg: ChatMsg }
  | { kind: 'message.bot.delta'; botId: string; msgId: string; text: string }
  | { kind: 'message.bot.final'; botId: string; msg: ChatMsg }
  | { kind: 'message.system';    botId: string; text: string; ts: string }
  | { kind: 'activity';          botId: string; widgetId: string; patch: unknown; transient: true }
  | { kind: 'action.ack';        botId: string; actionId: string; ok: boolean; detail?: string }
  | { kind: 'approval.request';  botId: string; approval: ApprovalRequest }
  | { kind: 'intent.schedule';   botId: string; intent: ScheduleIntent }
  | { kind: 'intent.webview';    botId: string; url: string; title?: string }
  | { kind: 'bots.changed';      bots: BotSummary[] };
```

- `message.bot.delta` / `.final` is the streaming pair: deltas update one
  in-flight message in place; `final` settles it. Settle detection is the
  adapter's problem (for Muse: DOM quiescence; for the mock: its script),
  never the UI's.
- `activity` is the brief's transient channel: it updates widgets and the
  stationary rail and is **never** appended to a chat log or persisted as a
  message.
- `intent.*` kinds are **reserved now, built later (§10)**: they are how a
  chat will drive the schedule, WebViews and dashboards without a breaking
  change to this union. Reserving a kind costs nothing; the mock does not
  emit them in the status slice.

### 5.3 Capabilities

```ts
interface AdapterCapabilities {
  streaming: boolean;        // message.bot.delta is real, not simulated chunking
  listBots: boolean;
  approvals: boolean;
  activity: boolean;
  surfaceActions: boolean;   // Control Panel invokeAction
  scheduleIntents: boolean;
  webviewIntents: boolean;
}
```

Capabilities are part of status (§6), so the UI re-renders what it offers
when the adapter — or its health — changes. MockAdapter reports everything
`true` (it simulates); MuseAiAdapter reports what the page actually gives
it, and may *lose* a capability when degraded (e.g. approvals observer
lost) without losing the connection.

## 6. Adapter status — the model

Status is the contract this design is really about, because it is the first
thing built (§8) and every adapter must speak it.

### 6.1 Shape

```ts
type AdapterPhase =
  | 'unconfigured'   // constructed, connect() not yet called
  | 'connecting'     // connect() in flight, checks running
  | 'ready'          // all required checks pass
  | 'degraded'       // send/receive work; an optional check fails or warns
  | 'disconnected'   // was ready/degraded, channel lost (tab closed, bridge down)
  | 'error';         // a required check failed; user action can usually fix it

type CheckState = 'pending' | 'pass' | 'warn' | 'fail' | 'skip';

interface AdapterCheck {
  id: string;              // stable, shared across adapters where the meaning matches
  label: string;           // human label for the checklist UI
  required: boolean;
  state: CheckState;
  detail?: string;         // short, safe to show (never a credential, token or selector dump)
  at?: number;             // when this state was entered (epoch ms)
}

interface AdapterStatus {
  adapterId: string;
  adapterVersion: string;
  seq: number;             // monotonic per adapter session — UI ignores older snapshots
  phase: AdapterPhase;
  since: number;           // when this phase was entered
  lastEventAt?: number;    // last event or heartbeat from the adapter (staleness, §6.5)
  detail: string;          // one human sentence for the phase, safe to show verbatim
  checks: AdapterCheck[];
  identity?: { displayName: string };   // e.g. the Muse agent's name — display only
  currentBotId?: string;
  capabilities: AdapterCapabilities;
  error?: { code: string; message: string; recoverable: boolean; actionHint?: string };
}
```

### 6.2 The shared checklist

Check ids are **shared vocabulary**, not per-adapter invention — the mock
simulates *the same checks* the Muse extension will really run, so the UI,
the derivation rules and the tests built against the mock remain true for
the real adapter.

| Check id | Label | Required | Mock behaviour | Real probe (Muse extension, §9) |
|---|---|---|---|---|
| `bridge` | Bridge reachable | yes | passes in connect script | bridge WebSocket handshake from the app |
| `extension` | Extension connected | yes | passes in connect script | extension background has checked in with the bridge |
| `tab` | Muse tab found | yes | passes in connect script | a muse.ai tab is registered with the extension |
| `page` | Muse page ready | yes | passes in connect script | content script loaded, app DOM mounted |
| `auth` | Signed in | yes | passes (scenario can fail it) | composer/avatar present; logged-out landing absent |
| `composer` | Composer found | yes | passes (scenario can fail it) | composer element located by resilient selectors |
| `messageList` | Message list found | yes | passes in connect script | message container located |
| `observer` | Reply observer armed | yes | passes in connect script | MutationObserver attached and firing |
| `approvals` | Approval observer | no | passes (scenario can warn it) | approval-card observer attached |
| `activity` | Activity observer | no | passes (scenario can warn it) | activity/status region located |

Adapters may add namespaced checks (`muse.*`, a future service's own), but
the rows above must mean the same thing in every adapter that has the
concept.

### 6.3 Phase derivation — shared, pure, tested

Phase is **derived from the checks by one pure function**, shared by all
adapters, never set ad hoc by adapter code:

```ts
function derivePhase(checks: AdapterCheck[], channel: 'idle' | 'open' | 'closed'): AdapterPhase
```

| Condition | Phase |
|---|---|
| `connect()` never called | `unconfigured` |
| connect in flight, any required check still `pending` | `connecting` |
| any required check `fail` | `error` (with that check's `actionHint`) |
| all required `pass`, any optional `warn`/`fail`, or a capability lost | `degraded` |
| all required `pass`, no optional `warn`/`fail` | `ready` |
| channel closes after having been `ready`/`degraded` | `disconnected` |

Because derivation is pure and shared, "why does the app think we're
degraded?" always has one answer, printable from the snapshot.

### 6.4 Per-bot presence

`BotSummary.status` in the prototype (`active | idle | error`) is currently
hard-coded. Under an adapter it is *reported*: the adapter owns each bot's
presence, and the sidebar dot / header dot / `LIVE` badge render it. For
the mock, presence is scripted per bot (GH‑01 active, FLD‑03 idle, INB‑01
error — preserving the prototype's story). For Muse, presence is a
conversation-level fact (current chat open, reply in flight, attention
needed) — its exact mapping is Q1 (§12).

`Last sync` in the bot header stops being a hard-coded string and renders
from `status.lastEventAt`.

### 6.5 Status is ephemeral

- Status lives in an in-app store (snapshot + subscribers), **never** in the
  persisted `records.*` store and never sent anywhere. A restart starts at
  `unconfigured` and earns `ready` again through the checks.
- A status **log** (last ~100 transitions, in memory only) backs the status
  panel (§7.2): phase, time, the check that moved — diagnostics, not chat.
- **Staleness:** adapters heartbeat (the mock: every 5 s; the extension:
  its bridge ping). If `now - lastEventAt > 15 s` while phase is
  `ready`/`degraded`, the UI marks the snapshot *stale* (a display state
  layered over the snapshot, not a new phase) — this is what lets a frozen
  tab or a dead bridge be *seen* instead of silently believed.

### 6.6 Tab presence protocol (Muse fuse)

§6.5 staleness covers a dead *channel*; it cannot see a dead *tab* —
the bridge and extension stay up, status frames simply stop arriving,
and before this protocol the app sat at `ready` over a closed tab
indefinitely (real-page calibration finding, 2026-11-12). Presence is
therefore tracked explicitly, at the transport layer:

- The **content script** beats `{kind:'presence', state:'alive'}` every
  **~2 s** through the background worker, and sends a best-effort
  `state:'gone'` on `pagehide`.
- The **background worker** adds the fast path: `tabs.onRemoved` for
  the registered tab, or `tabs.onUpdated` navigating it away from a
  matched URL, sends `state:'gone'` immediately. The tab id is kept in
  `chrome.storage.session` so a removal noticed after a worker restart
  is still recognised; the timeout below is the backstop regardless.
- The **bridge** owns presence freshness. Any extension traffic
  (presence beat, status report, event, result) marks the tab alive.
  Presence is lost on explicit `gone`, or after **> 6 s of silence**
  (3 missed beats). While absent, the bridge synthesizes the status
  report apps receive from the last real report with every
  **tab-dependent check failed** — `tab`, `page`, `auth`, `composer`,
  `messageList`, `observer`, `approvals`, `activity`,
  `muse.activityPanel` — under the detail *"Muse tab closed or not
  responding — reopen muse.ai"*. `bridge` and `extension` stay as they
  are (they are true). The synthesized report has the ordinary snapshot
  shape, so the adapter and `derivePhase` (§6.3) need no semantic
  changes; presence loss is simply a required check failing, with its
  usual consequences (error phase, composer gating per §7.3, exactly
  one system line in / one out per §7.4).
- Presence states are `unknown` (extension connected, no tab traffic
  yet — reports pass through untouched), `present`, `absent`. On
  recovery the bridge rebroadcasts the last real report immediately;
  the content script's next probe cycle (≤ 5 s) refreshes it. Apps
  connecting while absent are handed the gated report, not the stale
  healthy one.
- Presence frames are consumed by the bridge and never relayed; they
  carry no page content. Constants are env-overridable for tests
  (`MD_PRESENCE_TIMEOUT_MS`, `MD_PRESENCE_SWEEP_MS`).

## 7. How status appears in the app

Each surface below already exists in the prototype in hard-coded form; the
design re-points it at the status store. No new page is invented.

### 7.1 Top system bar — the phase pill

The static `SECURE CONTEXT` pill becomes the **adapter pill**: adapter name
+ phase (colour follows the prototype: green = ready, amber = degraded /
connecting, red = error, grey = unconfigured / disconnected), with the
heartbeat dot becoming real. Clicking it opens the status panel (§7.2).

### 7.2 Adapter status panel (drawer)

Opened from the pill; a drawer over the current page, not a tab (status is
app-level, not per-bot). Contents:

- Phase + `detail` sentence + since / last-event times (staleness shown here)
- The checklist: every check, its state, label and detail
- Identity (e.g. `Kavi`) and current bot, when known
- Capabilities, as reported
- Status log (transitions, §6.5)
- Commands the phase allows: **Reconnect** (`disconnect()` + `connect()`);
  in dev/mock mode, the scenario controls (§8.3)

### 7.3 Composer and command gating

| Phase | Composer | Send behaviour |
|---|---|---|
| `unconfigured`, `connecting` | disabled, placeholder names the phase | — |
| `ready` | enabled | normal |
| `degraded` | enabled, with a slim warning strip naming the lost capability | normal for capabilities that remain |
| `disconnected`, `error` | disabled, **draft preserved** | a send attempt (e.g. via Enter before disable settles) rejects as `not-ready` → toast with the phase + `actionHint`; nothing is silently dropped |

### 7.4 Chat-log footprint — deliberately small

Status transitions do **not** go to the chat log, with two exceptions that
each produce exactly one `system` line: entering `error`, and recovering
from `error`/`disconnected` to `ready`. A user who was looking at the chat
learns "the bot connection broke / is back"; the checklist detail lives
in the panel. This follows the brief's rule for transient activity.

### 7.5 Sidebar and header

Bot dots, `LIVE` badges and the header presence dot render `BotSummary`
presence (§6.4). The header's hard-coded "CONNECTED RESOURCES" pills are
replaced by a summary of the passing global checks for the selected bot's
adapter (for the mock: the same resource names, now as reported data).


## 8. Getting MockAdapter status working — the first build slice

This is the work the owner asked to be worked out: what it takes for
**MockAdapter status** to work, end to end, before any other adapter work.

### 8.0 What "working" means (exit criteria)

1. The app boots against MockAdapter by default, visually identical to the
   prototype except for the status surfaces in §7.
2. On boot the adapter pill visibly walks `connecting → ready`, check by
   check, because MockAdapter emits a status snapshot at **every** step —
   not just the final one.
3. The status panel shows the full shared checklist (§6.2) with all checks
   `pass`, identity, capabilities, and a transition log that matches the
   snapshots emitted.
4. Each mock scenario (§8.3) produces its specified phase and UI behaviour,
   driven in a real browser, not just asserted in a unit test.
5. Commands respect status: `sendMessage` in a non-ready, non-degraded
   phase rejects as `not-ready`, the draft survives, and a toast names the
   phase — again, driven, not just unit-tested.
6. Gate green: typecheck, unit tests, production build (§8.6).

### 8.1 Step 0 — scaffold (prerequisite, no behaviour)

The prototype is two files exported from a webartifact; there is no
package, no build, no test runner in the seed repo. The status slice needs:

- A Vite + React + TypeScript scaffold at the repo root, versions pinned,
  Tailwind wired so the prototype's utility classes and CSS variables in
  `index.css` render exactly as exported. `App.tsx` moves to `src/App.tsx`
  **visually unchanged**; the seed folder stays in place as the reference
  export until the scaffold is proven against it.
- `records.*` persistence: the prototype's `apiCall("records.*")` targets a
  webartifact host that a standalone app does not have. For the status
  slice this is stubbed behind one module (`src/app/records.ts`) with a
  local in-memory/localStorage implementation honouring the same call
  shape, so no component changes when a real backend arrives. (Backend
  choice is Q3, §12 — it must not block the status slice.)
- Scripts from day one: `dev`, `build`, `typecheck`, `test`. A failure in
  any of them is reported against this scaffold state (commit, clean tree,
  install result), per our standing repo-triage practice.

### 8.2 Step 1 — types and the derivation function (no UI)

- `src/adapters/types.ts` — everything in §5 and §6, verbatim as the
  contract. No adapter code yet.
- `src/adapters/derivePhase.ts` — the pure function in §6.3 plus its unit
  tests: every row of the derivation table, including optional-warn →
  `degraded` and channel-close → `disconnected`. This is the one piece
  whose correctness the whole status story rests on, so it lands first,
  alone, tested.

### 8.3 Step 2 — MockAdapter

`src/adapters/MockAdapter.ts`: an in-process class implementing the full
§5 interface. For the *status* slice its duties are:

**Connect script (default `happy` scenario).** `connect()` emits, in
order, roughly 250–400 ms apart (delays are configuration, see below):

1. snapshot: phase `connecting`, all checks `pending`
2. `bridge` pass → snapshot
3. `extension` pass → snapshot
4. `tab` pass → snapshot
5. `page` pass, `auth` pass → snapshot
6. `composer` pass, `messageList` pass → snapshot
7. `observer` pass, `approvals` pass, `activity` pass → snapshot:
   phase now derives to `ready`, identity `{ displayName: 'Kavi (mock)' }`,
   `currentBotId` set, capabilities all `true`

**Heartbeat.** Every 5 s while connected, a snapshot with a fresh
`lastEventAt` (same phase/checks, `seq` bumped) — exercises the staleness
display (§6.5) honestly: stop the heartbeat and the UI must notice.

**Scenarios.** Selected by constructor config — in the app, from the
status panel's dev controls (§7.2) or a `?mockScenario=` URL parameter;
never from ambient randomness, so any reported behaviour is reproducible:

| Scenario | Script difference | Expected end state |
|---|---|---|
| `happy` (default) | as above | `ready` |
| `slow` | all delays ×5 | `connecting` for ~7 s, then `ready` — proves the UI doesn't flash an error state while waiting |
| `degraded` | `approvals` and `activity` land as `warn` | `degraded`; those two capabilities reported `false`; composer stays enabled with the warning strip |
| `notLoggedIn` | `auth` lands `fail` | `error`, `actionHint`: "Open muse.ai and sign in, then Reconnect"; composer disabled |
| `composerMissing` | `composer` lands `fail` | `error`, hint names the page may have changed (the brittle-fuse failure, rehearsed) |
| `disconnectAfterReady` | reaches `ready`, then channel closes at +10 s, heartbeat stops | `disconnected`; one system chat line; Reconnect returns to `ready` |
| `flaky` | `observer` fails once, auto-retries inside `connect()`, then passes | `connecting` throughout (no error flash), then `ready`; the retry is visible in the status log |

**The rest of the interface, in the status slice.** Deliberately minimal,
honest stubs — present so §7's surfaces work, explicitly *not* the
messages slice (§11):

- `listBots()` returns the prototype's four bots, with scripted presence
  (§6.4).
- `openConversation()` returns the prototype's `INITIAL_MSGS` for that bot.
- `sendMessage()` gates on phase (§7.3) and, in `ready`/`degraded`, emits
  the prototype's canned reply as `message.bot.delta` chunks + `.final` —
  enough to prove the event path, labelled in code as slice-2 placeholder
  behaviour.
- `invokeAction()` gates the same way and emits `action.ack`.
- `resolveApproval()` rejects `unsupported` (mock approvals are simulated
  in the messages slice, not the status slice).

**Determinism.** Timers go through an injected scheduler (real timers in
the app, fake timers in tests). No `Math.random()` in status paths — the
prototype's live-value jitter is an `activity`-slice concern, not status.

### 8.4 Step 3 — status store and surfaces (UI)

- `src/app/adapterStore.ts` — subscribes to the active adapter's
  `onStatus`, keeps the latest snapshot (dropping any with a lower `seq`),
  the transition ring buffer (§6.5), and a 1 s tick so staleness (§6.5) and
  relative times ("12 s ago") re-render without adapter traffic.
- `src/app/useAdapter.ts` — the one hook components use; components never
  import an adapter directly.
- Surfaces, in build order (each is small; the order makes every step
  demonstrable):
  1. `AdapterStatusPill` in the top bar (§7.1)
  2. `AdapterStatusPanel` drawer with checklist + log + Reconnect +
     mock scenario controls (§7.2)
  3. Composer gating + send-rejection toast (§7.3)
  4. System-line emission on error/recovery transitions (§7.4)
  5. Sidebar/header presence re-pointed at `BotSummary` (§7.5)
- Registry: `src/adapters/registry.ts` picks the adapter from config
  (`?adapter=mock` is the default and, in this slice, the only value that
  resolves; `muse-ai` resolves to a construction error in the panel —
  an honest "not built yet", not a silent fallback to mock).

### 8.5 What is *not* needed for MockAdapter status

Naming these explicitly, because each is a tempting scope-grab:

- No extension, no bridge, no WebSocket — MockAdapter is in-process.
- No real muse.ai probing of any kind.
- No new backend and no change to `records.*` semantics (§8.1 stub only).
- No dashboard-driving, no `intent.*` emission, no approvals UI.
- No multi-adapter switching UI — the registry resolves one adapter;
  switching is a config change, not a feature, until a second adapter
  exists.

### 8.6 Verification for the status slice

Two kinds of evidence, kept separate in the build report (our standing
verification rule for interactive builds):

- **Structural:** `tsc` clean; unit tests for `derivePhase` (every table
  row), for MockAdapter's connect script under fake timers (snapshot
  sequence, seq monotonic, scenario end-states from the §8.3 table), and
  for command gating (`not-ready` rejection, draft-preservation is a UI
  behaviour — see below); production build clean.
- **Driven:** the app running in a browser (headless probe + a live pass),
  at 1600×1000 and 1366×768, with layout snapshots for the new drawer:
  - boot → pill walks to `ready`; panel checklist all `pass`
  - switch to `degraded` → pill and warning strip change; composer still
    sends
  - switch to `notLoggedIn` → `error`, composer disabled, typed draft
    survives a send attempt, toast names the phase, Reconnect (after
    switching the scenario back to `happy`) recovers to `ready`
  - `disconnectAfterReady` → `disconnected` at ~10 s, stale marker appears
    after the 15 s threshold, one system line in the chat — not more
  - drawer opens/closes, never covers the whole app at either viewport
    (measured, not eyeballed — coverage % reported)

A check that was not driven is reported as implemented-and-untested, with
the exact clicks that would settle it. The user is never the deciding test
for a check a probe could have run.

## 9. The Muse AI adapter (B) — outline

Not built in the status slice; recorded here so the status model can be
judged against the real thing it must fit.

**Parts.** (a) A Manifest V3 extension: a background service worker and a
content script matched to `https://muse.ai/*`. (b) A local bridge: a
small Node process serving a WebSocket on localhost only, holding one
connection from the app and one from the extension background, relaying
commands/events/status without interpreting them. (c) `MuseAiAdapter` in
the app, speaking to the bridge — from the core's point of view it is
indistinguishable from MockAdapter.

**Check mapping.** The §6.2 probes are the content script's job, in order:
bridge handshake → extension check-in → tab registration → page-ready
(DOM mounted) → auth (composer/avatar present vs the logged-out landing)
→ composer and message-list location (role/text/structural selectors, in
that order of preference — generated class names are never a primary
selector) → observers armed. Every probe failure is a check `fail` with a
user-actionable `detail`, which is how selector churn will announce itself
instead of hanging.

**Send / receive.** Send: the content script sets the composer value using
the page framework's native value path, dispatches the input events the
page listens for, and triggers its send control — then *confirms* by
observing the user's message land in the message list (a send that cannot
be confirmed is an `action.ack`/command failure, not a success). Receive:
a MutationObserver over the message list produces `delta`s; **settle** is
defined as no mutations for a quiet period *and* no streaming indicator
present — both conditions, so a paused stream is not mistaken for a
finished one.

**Approvals.** The approval observer (the optional `approvals` check)
mirrors a card into an `approval.request` event; `resolveApproval` clicks
the corresponding control in the page. Approvals are never auto-resolved
by the adapter, and never forged at the bridge or protocol level — the
click in the real page is the resolution.

**Activity.** The content script carries an `activityPanel` observer
(a namespaced optional check, §6.2): it opens/reads Muse's Activity
panel and mirrors its entries — Active (title, status, elapsed, and the
detail text of what the activity is doing) and Past (title, outcome,
time) — as `activity` events in the `ActivityPatch` shape (§2.10).
The panel is the source of record because it is Muse's own accounting
of the work; the working/streaming indicator signals are kept as the
fallback for activity that has no panel entry. Mirrored activity stays
transient: it is never written to a chat log or the app's records.

**Approval scopes (§2.12).** Muse's approvals offer scopes — allow
*once*, *always* allow, deny, with per-connection defaults. So
`approval.request` carries an optional `scopes` field (the scopes the
page actually offers, e.g. `['once', 'always']`), and
`resolveApproval(botId, approvalId, decision)` takes the chosen scope
alongside the decision (`scope?: 'once' | 'always'`). Needs You shows
the scope that was chosen ("Allowed — always" in the decision log).
An adapter whose page offers no scopes omits the field; the app then
shows plain Allow/Deny.

**Security posture.** The bridge binds localhost only and pairs app ↔
extension with a locally generated token the user confirms once (stored
in extension storage and bridge config, never in the page, never in
`localStorage`, never in this repo). The content script works with the
page the user is already signed into; it does not read, export or store
cookies, tokens or credentials, and check `detail` strings never contain
them. If any future step would require extracting a session credential,
that step stops and goes back to the owner — it is not part of this
design.

**Known brittleness, accepted.** Selector churn (mitigated by the probe
order and by failures surfacing as checks), page redesigns, sign-in
expiry requiring a manual sign-in in the tab, one registered tab at a
time in v1, and Muse UI changes that move approvals/activity out of the
observed DOM (which degrade capabilities, §5.3, rather than breaking the
connection).

## 10. After the adapter: chat-driven dashboards and app modules

Reserved, wanted, and explicitly **not** in the adapter slices:

- `activity` events drive the stationary rail and dashboard widgets
  (transient, unlogged) — including, for Muse, activity observed in the
  page (a turn's work summarised as widget state, in the spirit of ALE's
  Stationary view: latest result pinned, activity in category columns,
  rather than a scrolling log).
- `intent.*` events let a bot's chat open WebView tabs, propose schedule
  entries (Gantt/calendar), update tasks/kanban and fill dashboard
  widgets — the brief's "bot opens a page / the user is told to look at
  the dashboard" flows, as structured events the app modules consume,
  not as text scraped out of replies.
- Control Panel forms/buttons become `invokeAction` calls whose results
  return as events — bot-authored in the sense that an adapter (or the
  bot through it) can propose new surface actions, which the app renders.
- Global resource modules (§1) get their own registry beside the adapter
  registry: monitors and accounts emit callbacks that are routed to bots
  as events. Adapters are for *bot services*; resources are a second,
  distinct plug-in kind, and conflating them is a named design error to
  avoid.

## 11. Build slices

In order; each slice ends demonstrable and gated, on its own branch, in
its own worktree if ALE work is running in parallel, and **nothing is
pushed without the owner's word for that specific change**.

| Slice | Contents | Exit |
|---|---|---|
| 0 | Scaffold (§8.1) | Prototype running standalone, visually identical, gate green |
| 1 | **MockAdapter status** (§8.2–§8.4) | §8.0 exit criteria, driven per §8.6 |
| 2 | Mock messages/actions/activity through events | Prototype's fake behaviours all arrive via `BotEvent`; no page fakes data directly |
| 3 | Bridge + extension health | Real §6.2 checks replace mock ones; panel shows the real checklist against a signed-in muse.ai tab |
| 4 | Real send | A message sent from the app lands in muse.ai and is confirmed by observation |
| 5 | Real receive | Streamed reply settles in the app as one final message; no duplicates on reload/reconnect |
| 6 | Approvals + activity | Approval from muse.ai resolves from the app; activity updates the rail, unlogged |
| 7+ | Chat-driven dashboards (§10), app modules, resources | Per-module designs, written when the adapter is proven |

## 12. Open questions for the owner

These do not block Slice 0–1 (the mock answers them by construction), but
each blocks the slice named beside it.

- **Q1 — Bots vs conversations (blocks Slice 3).** In Muse there is one
  agent and many chats (main + side chats). Is a "bot" in the sidebar the
  *agent* (one bot, conversations inside it), or is each *side chat* a
  bot? Proposal: bot = the agent (one Muse bot), conversations listed
  inside it; the mock's four bots then demonstrate the multi-bot future
  rather than Muse's shape. Owner to confirm or correct.
- **Q2 — Where the app runs (blocks Slice 3).** Local dev server on the
  owner's machine (simplest; the bridge and extension are local anyway)
  vs a packaged desktop shell later. Proposal: local web app first;
  packaging is a later slice, not a v1 concern. **DECIDED 2026-11-11**
  (owner: "do remaining slices"): local web app first, per proposal.
- **Q3 — App persistence (blocks Slice 2's real store, not its stub).**
  The prototype expects a `records.*` backend. Local-only (SQLite/file
  via the bridge process) vs the bridge doubling as the records host.
  Proposal: the bridge process hosts records too, so "run one local
  thing" stays true. **DECIDED 2026-11-11** (same go-ahead): the bridge
  hosts records.

**Slices 2–7 authorised 2026-11-11** (owner: "do remaining slices").
Verification strategy for slices 3–6, set at authorisation: the
extension/bridge/adapter are verified against a local muse.ai-like
fixture page (framework-controlled composer, streaming replies, an
approval card, a working indicator) driven in headless Chromium with
the real extension loaded — the same code paths then run against
muse.ai via the extension's match patterns and selector config. The
final real-page check (install the unpacked extension in the owner's
own browser, pair, open muse.ai) is an owner step; the build ships the
exact steps and must not claim it done.
- **Q4 — Status panel shape (blocks Slice 1's UI step, small).** Drawer
  over the current page (this design's assumption) vs a dedicated
  Settings-style page. Drawer proposed: status is a glance, not a place.
- **Q5 — Mock scenarios in production builds (blocks Slice 1, small).**
  Scenario controls are a development instrument. Proposal: present only
  when the mock is the active adapter *and* a `dev` flag is set; the mock
  itself remains shippable as the demo/offline adapter.
- **Q6 — What API / Tool Chat Mode looks like (blocks nothing now).**
  Deliberately unanswered (§2.6): its composition, bots and tool
  surfaces are a later design, made when that mode is actually wanted.
  V0.1 only reserves the mode switch, mode-scoped adapters and
  mode-declaring pages. Any earlier sketch would be a guess dressed as a
  plan.

## 13. Risks and honest limits

- The Muse adapter is built on an unsupported surface; it **will** break
  when muse.ai changes. The design's answer is not robustness theatre —
  it is that every breakage lands as a named failed check with a hint, in
  a panel built for exactly that, from the very first (mock) slice.
- MockAdapter can prove the *app* honours the contract; it cannot prove
  the contract is sufficient for the real page. Slice 3 exists to find
  that out with health checks only, before send/receive depend on it.
- This document describes the seed prototype from its exported files.
  Behaviour the export does not contain (any backend the webartifact host
  provided for `records.*`) is treated as a contract shape only, per
  §8.1 — if the owner's hosted version did more, that is new information
  for a v0.2, not something to guess into v0.1.
