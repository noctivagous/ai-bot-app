// Demo mode (DEMO.md) — the public, try-it-in-your-browser build of
// Mission Desk. One function decides it:
//
//   - the demo build bakes VITE_MD_DEMO=1 (npm run build:demo), or
//   - the URL carries ?demo=1 (handy for trying it against `npm run dev`).
//
// In demo mode the desk is locked to the simulated (mock) adapter and
// says so in a banner. The lock matters: without it, a deployed demo
// page honouring ?adapter=muse could be pointed at a visitor's own
// local bridge. Records stay in the browser (localStorage), which is
// already the mock mode behaviour — demo mode changes nothing there.

export function isDemoMode(
  search: string,
  envFlag: string | undefined = import.meta.env.VITE_MD_DEMO,
): boolean {
  if (envFlag === '1') return true;
  return new URLSearchParams(search).get('demo') === '1';
}
