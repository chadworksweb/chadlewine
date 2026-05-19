import { createPublicClient, createAdminClient } from "@/lib/supabase-server";

type Client = ReturnType<typeof createPublicClient> | ReturnType<typeof createAdminClient>;

/**
 * Returns a Set of song IDs that are linked to a release of type 'single'.
 * Use to attach an is_single boolean to song rows after fetch.
 */
export async function getSingleSongIds(supabase: Client): Promise<Set<string>> {
  const { data } = await supabase
    .from("release_songs")
    .select("song_id, releases!inner(release_type)")
    .eq("releases.release_type", "single");
  return new Set(((data ?? []) as Array<{ song_id: string }>).map((r) => r.song_id));
}
