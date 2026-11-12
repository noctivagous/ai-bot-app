# Sketch — Goals & Ideas counterparts for Mission Desk

**Status: DESIGN ONLY (D3, decided by the owner 2026-11-12).** The build
stays parked (DESIGN.md §2.12) until the owner un-parks it. This sketch
exists so that un-parking later is a build, not a research project: it
fixes the desk-side shape against the client's observed forms (UI survey
S9, `docs/UI-SURVEY-REPORT.md` on branch `feat/ui-survey`; FEATURE-MAP
S9/D3). Nothing here is code, a schema, or a data flow.

## What the client has (survey evidence, S9)

- **Ideas (`/ideas`)** — H1 + intro line + an "Open side-by-side chat"
  button; a "Featured ideas" region, then H2 category regions (Financial
  Management, Productivity, Relationships, Health & Fitness, Shopping).
  An idea item is a full-width button carrying title + description, with
  a "More options for …" menu.
- **Goals (`/goals`)** — a "Tracking" region of goal rows: a checkbox
  "Mark … complete", a live status region (**which rendered empty in
  every survey snapshot — what it carries, if anything, is unobserved**),
  a goal button with title + detail, and a "Goal options" menu; then
  "Show 10 more". Below, a "Create a goal" region with category buttons
  (Health, Relationships, Finance, Career, Interests, Productivity,
  Something else).

## Counterpart 1 — a Goals zone on the Board (read-mostly)

**Placement.** Its own zone on the Board, below the Activity zones —
goals are the owner's standing commitments, not activity. Working title
in the desk's zone grammar: **GOALS · tracked in Muse**.

**Row anatomy** (mirrors the client's row, in desk form):

- Title + detail, as the client's goal button carries them.
- The complete state, shown as the client's checkbox shows it — but
  **read-mostly**: the desk displays the state Muse reports. Whether
  the desk may *set* it (actuating the client's checkbox through the
  page, approval-observer style) is unproven and is a build-time
  question for the un-parked slice, not an assumption here. Until then,
  toggling in the desk is an app-side organisational act only if the
  owner files it as one (§2.9 manual-first) — the sketch takes no
  position; it reserves the control's place.
- A status slot where the client's live status region sits. The sketch
  is explicit about the caveat: that region rendered empty throughout
  the survey, so the desk shows this slot only when the adapter
  actually reports content for it — never a fabricated status.
- App-side organisation the client doesn't have (the desk's charter,
  §2.8): the goal row can name its linked project/goal record in the
  app's store, the way conversations already carry project + goal
  links. Filing stays manual-first.

**Behaviour notes.** "Show 10 more" pagination mirrors the client's own
cap; the zone shows the first page and the count of the rest. Goals are
snapshotted state, not a stream — they refresh when the adapter reports,
like conversations do.

## Counterpart 2 — Ideas as a proposals queue (§2.9 pattern)

Ideas map to the desk's existing proposals pattern — the same one
schedule intents already use: **nothing is applied silently; the owner
accepts or rejects.**

- Ideas arrive (when the adapter can report them) as proposal rows:
  title + description + category, with "Featured" marked where the
  client marks it. Placement: a queue in the Needs You zone's family —
  working title **IDEAS · proposed by Muse**, visually a sibling of the
  schedule-proposals surface, not of approvals (an idea is not a
  permission).
- **Accept-and-act = "Open side-by-side chat"** — the client's own
  affordance for an idea, mirrored as the accept action: accepting an
  idea opens (or files) the side chat that pursues it, and the idea
  leaves the queue as an app-side record linked to that conversation
  (§2.8 links). Rejecting dismisses it; a dismissed idea does not
  re-arrive (the approval-decision suppression rule is the precedent).
- The client's "More options for …" menu has no desk counterpart in
  this sketch beyond accept/dismiss — its contents were listed by the
  survey but the sketch does not import actions the desk has no use
  for yet.

## What the adapter would need (future surface — NOT built)

Recorded so the un-parked slice starts from a list, not a blank page.
All of it is an open design question at build time, not a decision here:

- A read path for the two pages (or their panel equivalents): goal rows
  (stable id?, title, detail, complete state, status-region content
  when present) and idea items (id?, title, description, category,
  featured). The survey observed **no per-item ids** on these surfaces —
  identity synthesis (the Activity §2.10 problem again) is the known
  hard part.
- Event/report shapes alongside the §5 union (e.g. goals/ideas
  snapshots), plus capability + check entries in the §6.2 vocabulary —
  optional checks, so their absence degrades, never errors.
- For Ideas' accept action: a page command to open a side chat seeded
  from an idea — the send-path machinery is the nearest precedent.
- For Goals' checkbox: whether page actuation is safe/possible at all
  (see Counterpart 1) — to be proven against the fixture first, the way
  approvals were.

## Explicit non-goals

- No code, no records schema, no adapter events, no data flows.
- No creation surfaces: the client's "Create a goal" categories are
  noted as evidence, not mirrored — creating goals stays in Muse
  until the owner says otherwise.
- No un-parking: this sketch changes no build order. D1/D2/D4 shipped
  in the first refinement tranche; this counterpart pair ships only on
  the owner's word.

*Sources: FEATURE-MAP.md S9/D3; UI survey report (branch feat/ui-survey);
DESIGN.md §2.8/§2.9/§2.12.*
