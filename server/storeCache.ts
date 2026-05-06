import type { StoreItem } from "./types";
import { loadAllStoreItems, adminSupabase } from "./db";

// Module-level singleton — loaded once at server startup via initStoreCache().
const cache = new Map<string, StoreItem>();

export async function initStoreCache(): Promise<void> {
  const items = await loadAllStoreItems();
  cache.clear();
  for (const item of items) cache.set(item.id, item);
  console.log(`[store] Cached ${items.length} store item(s)`);
}

// Synchronous fast-path for items already in cache.
// Falls back to a live DB lookup for items added after server startup.
export async function getStoreItem(id: string): Promise<StoreItem | undefined> {
  if (cache.has(id)) return cache.get(id);

  const { data, error } = await adminSupabase
    .from("store_items")
    .select("id, name, model_url, price, thumbnail_url, category")
    .eq("id", id)
    .single();

  if (error || !data) return undefined;
  cache.set(id, data as StoreItem); // warm the cache for next time
  return data as StoreItem;
}
