import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function fetchUsername(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .single();
  return data?.username ?? null;
}
