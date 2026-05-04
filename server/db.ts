import { createClient } from "@supabase/supabase-js";
import type { MapConfig, PlacedObject } from "./types";

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
