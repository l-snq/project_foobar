"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initStoreCache = initStoreCache;
exports.getStoreItem = getStoreItem;
const db_1 = require("./db");
// Module-level singleton — loaded once at server startup via initStoreCache().
const cache = new Map();
async function initStoreCache() {
    const items = await (0, db_1.loadAllStoreItems)();
    cache.clear();
    for (const item of items)
        cache.set(item.id, item);
    console.log(`[store] Cached ${items.length} store item(s)`);
}
// Synchronous fast-path for items already in cache.
// Falls back to a live DB lookup for items added after server startup.
async function getStoreItem(id) {
    if (cache.has(id))
        return cache.get(id);
    const { data, error } = await db_1.adminSupabase
        .from("store_items")
        .select("id, name, model_url, price, thumbnail_url, category")
        .eq("id", id)
        .single();
    if (error || !data)
        return undefined;
    cache.set(id, data); // warm the cache for next time
    return data;
}
