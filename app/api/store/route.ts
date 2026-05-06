import { loadAllStoreItems } from "../../../server/db";

export async function GET() {
  try {
    const items = await loadAllStoreItems();
    return Response.json(items);
  } catch (e) {
    console.error("[store] GET error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
