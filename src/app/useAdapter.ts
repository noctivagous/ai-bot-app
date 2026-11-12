// The one hook components use (DESIGN.md §8.4). Components never import an
// adapter directly — they read status from the store and send commands via
// the store's adapter handle.

import { useSyncExternalStore } from 'react';
import { adapterStore, type AdapterStoreSnapshot } from './adapterStore';

export function useAdapter(): AdapterStoreSnapshot {
  // The store's snapshot is plain environment-independent data (no DOM),
  // so it doubles as the server snapshot — which also keeps components
  // renderable under SSR and in render tests.
  return useSyncExternalStore(
    adapterStore.subscribe,
    adapterStore.getSnapshot,
    adapterStore.getSnapshot,
  );
}

export { adapterStore };
