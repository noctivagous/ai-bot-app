// The one hook components use (DESIGN.md §8.4). Components never import an
// adapter directly — they read status from the store and send commands via
// the store's adapter handle.

import { useSyncExternalStore } from 'react';
import { adapterStore, type AdapterStoreSnapshot } from './adapterStore';

export function useAdapter(): AdapterStoreSnapshot {
  return useSyncExternalStore(adapterStore.subscribe, adapterStore.getSnapshot);
}

export { adapterStore };
