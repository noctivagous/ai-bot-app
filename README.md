# ai-bot-app — Mission Desk for Muse

A customizable, general-purpose bot app. Its first (and currently only) service
adapter connects it to the **Muse AI web client** (muse.ai), so the agent's
work gets what the client itself doesn't provide: an organisation layer —
projects with status, a board of work in flight, approvals and schedule you
can see, and conversations kept as records you can file, tag, rename and
search yourself.

The app never rebuilds what Muse already does well (memory, search,
scheduling, connectors, artifact hosting). It surfaces those through the
adapter; its own store holds only organisation. Design rationale, the
adapter contract, and the slice plan live in `DESIGN.md`. The original
design seed this repo started from lives in `reference/`.

## Layout

- `src/` — the app (Mission Desk). Runs against a MockAdapter by default.
- `bridge/` — a small local Node process (127.0.0.1:7701) that relays
  messages between the app and the extension, and hosts the app's records.
- `extension/` — the MV3 browser extension: the fuse to muse.ai (below).
- `tests/fixture/` — a muse.ai-like test page the extension is verified
  against in automated drives.
- `reference/` — the original design seed (brief, transcript, prototype).

## The extension

### What it is for (objectives)

The Muse web client cannot be embedded (it forbids framing) and exposes no
API, so the extension is the app's eyes and hands inside the one place the
agent already lives: **your own signed-in muse.ai tab**. Its objectives:

1. **Report health honestly.** It runs a fixed checklist against the page —
   bridge reachable, extension present, muse.ai tab open, page loaded,
   signed in, composer found, message list found, observer running, plus
   the approval and Activity observers — and the app turns that into a
   connection status. A failed check names exactly what wasn't found.
2. **Send for real.** When you send from the app, the extension types into
   the page's actual composer (the way its framework requires) and clicks
   the page's own send control — then confirms by observing your message
   land. Unconfirmed sends are reported as failures, never as sent.
3. **Receive for real.** It observes the message list, streams reply deltas
   to the app as the agent writes, and settles each reply into exactly one
   final message.
4. **Resolve approvals in the page.** When Muse asks permission, the
   request appears in the app's Needs You list (with its scope — once /
   always). Your decision is carried back and the extension clicks the
   page's real Allow / Always allow / Deny control. Nothing is forged.
5. **Mirror Activity.** It watches the client's Activity view (active and
   past work, with detail) and mirrors it into the app's Running Now cards
   and Recently Finished list. Activity is transient — it is never written
   to the app's records.

Binding rules: the extension **never reads cookies, tokens, passwords or
any credential**; it only observes and operates page DOM. All selectors
live in one config file (`extension/selectors.js`), chosen by role, text
and structure — never generated class names. The fuse is deliberately
brittle-but-honest: when muse.ai changes, a named check fails and tells
you which selector to tune, instead of the app silently misbehaving.

### How to use it

Prerequisites: Node 20+, Chrome (or Chromium) with Developer mode
available, and a muse.ai account you can sign in to.

1. **Start the bridge** (first run creates the pairing token):
   ```bash
   cd bridge && npm install && npm start
   ```
   The token is written to `bridge/.pairing.json` (the path is printed;
   the token is not logged). Keep the bridge running.
2. **Install the extension**: open `chrome://extensions`, enable
   **Developer mode**, choose **Load unpacked**, and select this repo's
   `extension/` folder.
3. **Pair it**: click the extension's toolbar icon and paste the token
   from `bridge/.pairing.json`. The popup should say “Bridge: connected”.
4. **Open muse.ai** in a tab and sign in as usual. The tab registers
   itself with the extension automatically.
5. **Run the app** from the repo root:
   ```bash
   npm install
   npm run build && npx vite preview
   ```
   Open http://localhost:4173/?adapter=muse
6. **Check the connection**: the app's status lamp should walk through
   “connecting” to **ready**, with the checklist at 11/11 and your agent's
   name shown as the identity. Then use the app normally — send messages,
   watch replies stream in the chat panel, resolve approvals from
   Needs You, and watch Activity appear on the Board.

### When a check fails

The failing check is the diagnosis: it names the page element that wasn't
found (composer, message list, Activity panel, …). Tune that one entry in
`extension/selectors.js`, reload the extension from `chrome://extensions`,
and reconnect from the app. Nothing else needs to change — the app, the
bridge and the protocol are independent of the page's shape.

### Mock mode

Without `?adapter=muse`, the app runs against a simulated adapter —
the full Mission Desk experience with no extension, bridge or muse.ai
tab required:

```bash
npm run dev
```
