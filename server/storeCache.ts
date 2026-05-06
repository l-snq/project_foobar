import type { StoreItem } from "./db";
import { loadAllStoreItems } from "./db";

// Module-level singleton — loaded once at server startup via initStoreCache().
const cache = new Map<string, StoreItem>();

export async function initStoreCache(): Promise<void> {
  const items = await loadAllStoreItems();
  cache.clear();
  for (const item of items) cache.set(item.id, item);
  console.log(`[store] Cached ${items.length} store item(s)`);
}

export function getStoreItem(id: string): StoreItem | undefined {
  return cache.get(id);
}
