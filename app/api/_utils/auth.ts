import { adminSupabase } from "../../../server/db";

// Verifies a Supabase JWT and returns the user's UUID, or null if invalid.
export async function getUserFromToken(token: string): Promise<string | null> {
  const { data: { user }, error } = await adminSupabase.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}
