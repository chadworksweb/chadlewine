import { createAdminClient } from "@/lib/supabase-server";
import { SongwritingGridAdmin, type SongRow } from "@/components/SongwritingGridAdmin";

export const dynamic = "force-dynamic";

export default async function AdminSongwritingPage() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("songs")
    .select("id, title, available_for_a_voice, voice_display_order")
    .eq("status", "published")
    .order("available_for_a_voice", { ascending: false })
    .order("voice_display_order", { ascending: true })
    .order("title", { ascending: true });
  if (error) console.error("[admin/songwriting] load failed", error);
  const songs = (data || []) as SongRow[];
  return <SongwritingGridAdmin songs={songs} loadError={!!error} />;
}
