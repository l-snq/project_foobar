import { adminSupabase } from "../server/db";

const BUCKET = "store-assets";

export function getStoreModelUrl(filename: string): string {
  const { data } = adminSupabase.storage
    .from(BUCKET)
    .getPublicUrl(`models/${filename}`);
  return data.publicUrl;
}

export function getStoreThumbnailUrl(filename: string): string {
  const { data } = adminSupabase.storage
    .from(BUCKET)
    .getPublicUrl(`thumbnails/${filename}`);
  return data.publicUrl;
}

export async function uploadStoreModel(
  filename: string,
  buffer: Buffer,
): Promise<string> {
  const { error } = await adminSupabase.storage
    .from(BUCKET)
    .upload(`models/${filename}`, buffer, {
      contentType: "model/gltf-binary",
      upsert: false,
    });
  if (error) throw error;
  return getStoreModelUrl(filename);
}

export async function uploadStoreThumbnail(
  filename: string,
  buffer: Buffer,
): Promise<string> {
  const { error } = await adminSupabase.storage
    .from(BUCKET)
    .upload(`thumbnails/${filename}`, buffer, {
      contentType: "image/webp",
      upsert: false,
    });
  if (error) throw error;
  return getStoreThumbnailUrl(filename);
}
