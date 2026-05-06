import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getUserFromToken } from "../../_utils/auth";
import { adminSupabase } from "../../../../server/db";
import { uploadStoreModel, uploadStoreThumbnail } from "../../../../lib/storage";

const ADMIN_USER_IDS = new Set(
  (process.env.ADMIN_USER_IDS ?? "").split(",").filter(Boolean),
);

async function requireAdmin(token: string): Promise<string | null> {
  if (ADMIN_USER_IDS.size === 0) return null; // safety: block all if env not set
  const userId = await getUserFromToken(token);
  if (!userId || !ADMIN_USER_IDS.has(userId)) return null;
  return userId;
}

// POST /api/admin/store
// Multipart form: model (.glb), thumbnail (image), name, price, category, token
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const token = formData.get("token") as string | null;

    if (!token || !(await requireAdmin(token))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const name     = formData.get("name")     as string | null;
    const price    = formData.get("price")    as string | null;
    const category = formData.get("category") as string | null;
    const model    = formData.get("model")    as File   | null;
    const thumb    = formData.get("thumbnail") as File  | null;

    if (!name || !price || !model) {
      return Response.json({ error: "Missing required fields: name, price, model" }, { status: 400 });
    }

    const parsedPrice = parseInt(price, 10);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return Response.json({ error: "Invalid price" }, { status: 400 });
    }

    const modelExt = model.name.split(".").pop()?.toLowerCase();
    if (modelExt !== "glb" && modelExt !== "gltf") {
      return Response.json({ error: "Model must be .glb or .gltf" }, { status: 400 });
    }

    const id = randomUUID();
    const modelUrl = await uploadStoreModel(
      `${id}.${modelExt}`,
      Buffer.from(await model.arrayBuffer()),
    );

    let thumbnailUrl: string | null = null;
    if (thumb && thumb.size > 0) {
      const thumbExt = thumb.name.split(".").pop()?.toLowerCase() ?? "webp";
      thumbnailUrl = await uploadStoreThumbnail(
        `${id}.${thumbExt}`,
        Buffer.from(await thumb.arrayBuffer()),
      );
    }

    const { data, error } = await adminSupabase
      .from("store_items")
      .insert({
        id,
        name,
        model_url: modelUrl,
        price: parsedPrice,
        thumbnail_url: thumbnailUrl,
        category: category ?? "furniture",
      })
      .select("id, name, model_url, price, thumbnail_url, category")
      .single();

    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin/store] POST error:", e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
