// Control Panel surface actions (DESIGN.md §10): the bot's command
// surface inside the app. Actions are invoked through the adapter's
// invokeAction — for the mock that is an ack plus scripted effects; for
// the Muse adapter it is a structured command message sent through the
// chat send path (mapping documented in extension/README.md).

import type { SurfaceAction } from '../adapters/types';

export const CONTROL_ACTIONS: SurfaceAction[] = [
  { id: 'layout-review', label: 'Run layout review' },
  { id: 'transcript-check', label: 'Check transcript batch' },
  { id: 'compile-briefing', label: 'Compile briefing' },
];
