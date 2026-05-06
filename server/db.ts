import { createClient } from "@supabase/supabase-js";
import type { MapConfig, PlacedObject } from "./types";

export interface Profile {
  xp: number;
  currency: number;
  level: number;
}

export interface StoreItem {
  id: string;
  name: string;
  model_url: string;
  price: number;
  thumbnail_url: string | null;
  category: string;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_KEY!;

export const adminSupabase = createClient(url, key, {
  auth: { persistSession: false },
});

export async function loadHomeData(
  userId: string,
): Promise<{ map: MapConfig; placedObjects: PlacedObject[] } | null> {
  const { data, error } = await adminSupabase
    .from("homes")
    .select("map_json, placed_objects")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return {
    map: data.map_json as MapConfig,
    placedObjects: (data.placed_objects ?? []) as PlacedObject[],
  };
}

export async function insertHome(userId: string, map: MapConfig): Promise<void> {
  const { error } = await adminSupabase
    .from("homes")
    .insert({ user_id: userId, map_json: map, placed_objects: [] });
  if (error) throw error;
}

export async function saveHomePlacedObjects(
  userId: string,
  objects: PlacedObject[],
): Promise<void> {
  const { error } = await adminSupabase
    .from("homes")
    .update({ placed_objects: objects })
    .eq("user_id", userId);
  if (error) throw error;
}

// ---- Profiles ----

export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await adminSupabase
    .from("profiles")
    .select("xp, currency, level")
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  return data as Profile;
}

// Ensures a profile row exists for the user (safe to call on every join).
export async function upsertProfile(userId: string): Promise<Profile> {
  // Insert-ignore, then fetch — reliable for both new and existing users.
  await adminSupabase.from("profiles").upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
  const profile = await loadProfile(userId);
  if (!profile) throw new Error(`upsertProfile: profile missing for ${userId}`);
  return profile;
}

// Atomically increments xp and currency, recomputes level server-side via RPC.
// Returns the updated profile values.
export async function addXpAndCurrency(
  userId: string,
  xp: number,
  currency: number,
): Promise<Profile> {
  const { data, error } = await adminSupabase.rpc("add_xp_and_currency", {
    p_user_id: userId,
    p_xp: xp,
    p_currency: currency,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { xp: row.out_xp, currency: row.out_currency, level: row.out_level };
}

// ---- Inventory ----

export async function loadInventory(userId: string): Promise<Set<string>> {
  const { data, error } = await adminSupabase
    .from("inventory")
    .select("item_id")
    .eq("user_id", userId);
  if (error) throw error;
  return new Set((data ?? []).map((r: { item_id: string }) => r.item_id));
}

// Atomic purchase: checks balance, deducts currency, inserts to inventory.
// Returns the new currency balance.
// Throws with message "insufficient_funds" or "profile_not_found" on failure.
export async function spendCurrency(
  userId: string,
  itemId: string,
  price: number,
): Promise<number> {
  const { data, error } = await adminSupabase.rpc("spend_currency", {
    p_user_id: userId,
    p_item_id: itemId,
    p_price: price,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

// ---- Store items ----

export async function loadAllStoreItems(): Promise<StoreItem[]> {
  const { data, error } = await adminSupabase
    .from("store_items")
    .select("id, name, model_url, price, thumbnail_url, category")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as StoreItem[];
}
