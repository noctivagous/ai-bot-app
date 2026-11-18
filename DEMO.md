# Mission Desk Demo — the public, try-it-in-your-browser build

The demo is a **static build of the real desk UI** running entirely in the
visitor's browser on the built-in simulated adapter. There is no bridge
and no Muse account: the projects, chats, approvals and schedule are the
mock adapter's sample data, and anything you file or rename is kept in
the browser's local storage only.

It exists so anyone can try the desk's shape — the board, what needs
you, what's running, projects at a glance — before setting up the real
thing (bridge + extension, see `introduction.html`).

## How it works

- **Detection** — one function, `isDemoMode()` in `src/app/demoMode.ts`.
  Demo mode is on when the build sets `VITE_MD_DEMO=1` (the demo build
  bakes it in, so any static host works), or the URL carries `?demo=1`.
- **Adapter lock** — in demo mode the adapter registry always resolves
  the mock adapter. `?adapter=muse` is *not* honoured: a deployed demo
  page must never be pointed at a visitor's local bridge. Outside demo
  mode nothing changes — mock stays the default, `?adapter=muse` still
  selects the real adapter.
- **Records** — unchanged mock-mode behaviour: the bridge transport
  never engages, so organisation persists to localStorage (in-memory
  when storage is unavailable). Nothing leaves the browser.
- **Banner** — demo mode shows a strip across the top of the desk
  saying what the page is and linking to the real setup.

## Build and deploy

```sh
npm run build:demo   # tsc --noEmit, then dist-demo/ with the flag baked in
```

`dist-demo/` is plain static files — host it anywhere. For Cloudflare
Workers (the route the project's other dashboards use): the repo's
`wrangler.jsonc` serves `dist-demo/` as static assets with
single-page-app fallback, so the project's build settings are:

- Build command: `npm run build:demo`
- Deploy command: `npx wrangler deploy`

For Cloudflare Pages instead, use the same build command with output
directory `dist-demo`, and add a one-line `_redirects` file
(`/* /index.html 200`) to `dist-demo/` for the SPA fallback. That file
must *not* be in the output for the Workers route: Workers static
assets rejects it at publish time as an infinite loop (error 100324) —
there the fallback is `wrangler.jsonc`'s `not_found_handling`.
