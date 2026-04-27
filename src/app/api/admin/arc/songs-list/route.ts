import { createAdminClient } from "@/lib/supabase-server";

/**
 * Lightweight song picker for Capture Drawer's song_state_change form.
 * Returns id, title, slug, song_state, status, release_date.
 */
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("songs")
    .select("id,title,slug,song_state,status,release_date")
    .order("title");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}
