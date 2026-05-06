import type { NextRequest } from "next/server";
import { getUserFromToken } from "../_utils/auth";
import { adminSupabase } from "../../../server/db";

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "").trim();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getUserFromToken(token);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data: invRows, error: invError } = await adminSupabase
      .from("inventory")
      .select("item_id")
      .eq("user_id", userId);
    if (invError) throw invError;

    const itemIds = (invRows ?? []).map((r: { item_id: string }) => r.item_id);
    if (itemIds.length === 0) return Response.json([]);

    const { data: items, error: itemsError } = await adminSupabase
      .from("store_items")
      .select("id, name, model_url, price, thumbnail_url, category")
      .in("id", itemIds);
    if (itemsError) throw itemsError;

    return Response.json(items ?? []);
  } catch (e) {
    console.error("[inventory] GET error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
