"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminSupabase = void 0;
exports.loadHomeData = loadHomeData;
exports.insertHome = insertHome;
exports.saveHomeMap = saveHomeMap;
exports.loadProfile = loadProfile;
exports.upsertProfile = upsertProfile;
exports.addXpAndCurrency = addXpAndCurrency;
exports.loadInventory = loadInventory;
exports.spendCurrency = spendCurrency;
exports.loadAllStoreItems = loadAllStoreItems;
const supabase_js_1 = require("@supabase/supabase-js");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
exports.adminSupabase = (0, supabase_js_1.createClient)(url, key, {
    auth: { persistSession: false },
});
async function loadHomeData(userId) {
    const { data, error } = await exports.adminSupabase
        .from("homes")
        .select("map_json, placed_objects")
        .eq("user_id", userId)
        .single();
    if (error || !data)
        return null;
    let map = data.map_json;
    // One-time migration: fold legacy placed_objects column into map_json.placedObjects
    if (!map.placedObjects?.length && data.placed_objects?.length) {
        map = { ...map, placedObjects: data.placed_objects };
        await saveHomeMap(userId, map);
    }
    return { map };
}
async function insertHome(userId, map) {
    const { error } = await exports.adminSupabase
        .from("homes")
        .insert({ user_id: userId, map_json: map, placed_objects: [] });
    if (error)
        throw error;
}
async function saveHomeMap(userId, map) {
    const { error } = await exports.adminSupabase
        .from("homes")
        .update({ map_json: map })
        .eq("user_id", userId);
    if (error)
        throw error;
}
// ---- Profiles ----
async function loadProfile(userId) {
    const { data, error } = await exports.adminSupabase
        .from("profiles")
        .select("xp, currency, level")
        .eq("id", userId)
        .single();
    if (error || !data)
        return null;
    return data;
}
// Ensures a profile row exists for the user (safe to call on every join).
async function upsertProfile(userId) {
    // Insert-ignore, then fetch — reliable for both new and existing users.
    await exports.adminSupabase.from("profiles").upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
    const profile = await loadProfile(userId);
    if (!profile)
        throw new Error(`upsertProfile: profile missing for ${userId}`);
    return profile;
}
// Atomically increments xp and currency, recomputes level server-side via RPC.
// Returns the updated profile values.
async function addXpAndCurrency(userId, xp, currency) {
    const { data, error } = await exports.adminSupabase.rpc("add_xp_and_currency", {
        p_user_id: userId,
        p_xp: xp,
        p_currency: currency,
    });
    if (error)
        throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return { xp: row.out_xp, currency: row.out_currency, level: row.out_level };
}
// ---- Inventory ----
async function loadInventory(userId) {
    const { data, error } = await exports.adminSupabase
        .from("inventory")
        .select("item_id")
        .eq("user_id", userId);
    if (error)
        throw error;
    return new Set((data ?? []).map((r) => r.item_id));
}
// Atomic purchase: checks balance, deducts currency, inserts to inventory.
// Returns the new currency balance.
// Throws with message "insufficient_funds" or "profile_not_found" on failure.
async function spendCurrency(userId, itemId, price) {
    const { data, error } = await exports.adminSupabase.rpc("spend_currency", {
        p_user_id: userId,
        p_item_id: itemId,
        p_price: price,
    });
    if (error)
        throw new Error(error.message);
    return data;
}
// ---- Store items ----
async function loadAllStoreItems() {
    const { data, error } = await exports.adminSupabase
        .from("store_items")
        .select("id, name, model_url, price, thumbnail_url, category")
        .order("created_at");
    if (error)
        throw error;
    return (data ?? []);
}
