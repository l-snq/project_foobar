import type { NextRequest } from "next/server";
import { getUserFromToken } from "../../_utils/auth";
import { adminSupabase, spendCurrency } from "../../../../server/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemId, token } = body as { itemId?: string; token?: string };

    if (!itemId || !token) {
      return Response.json({ error: "Missing itemId or token" }, { status: 400 });
    }

    const userId = await getUserFromToken(token);
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: item, error: itemError } = await adminSupabase
      .from("store_items")
      .select("id, price")
      .eq("id", itemId)
      .single();

    if (itemError || !item) {
      return Response.json({ error: "Item not found" }, { status: 404 });
    }

    const newBalance = await spendCurrency(userId, item.id, item.price);
    return Response.json({ ok: true, newBalance });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("insufficient_funds")) {
      return Response.json({ error: "Insufficient funds" }, { status: 402 });
    }
    if (msg.includes("profile_not_found")) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }
    console.error("[store] buy error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
