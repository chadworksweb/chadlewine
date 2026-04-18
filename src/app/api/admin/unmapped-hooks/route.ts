import { createAdminClient } from "@/lib/supabase-server";

function normalize(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

interface HookSong {
  id: string;
  title: string;
  slug: string;
}

interface UnmappedHook {
  hook: string;
  songs: HookSong[];
}

export async function GET() {
  const supabase = createAdminClient();

  const [{ data: sections }, { data: doorPages }] = await Promise.all([
    supabase
      .from("song_visibility_sections")
      .select("song_id, key_points, song:songs(id, title, slug, status)")
      .eq("category", "hooks"),
    supabase.from("door_pages").select("target_queries"),
  ]);

  const mapped = new Set<string>();
  for (const dp of doorPages || []) {
    for (const q of dp.target_queries || []) {
      if (typeof q === "string") mapped.add(normalize(q));
    }
  }

  const byHook = new Map<string, { hook: string; songs: Map<string, HookSong> }>();

  for (const row of sections || []) {
    const kp = (row as { key_points: string[] | null }).key_points;
    if (!Array.isArray(kp)) continue;
    // Supabase joins are typed as arrays even for many-to-one — accept both shapes.
    const songRaw = (row as { song: HookSong | HookSong[] | null }).song;
    const song: HookSong | null = Array.isArray(songRaw) ? (songRaw[0] ?? null) : songRaw;
    if (!song) continue;

    for (const point of kp) {
      if (typeof point !== "string") continue;
      const trimmed = point.trim();
      if (!trimmed) continue;
      const key = normalize(trimmed);
      if (mapped.has(key)) continue;

      let entry = byHook.get(key);
      if (!entry) {
        entry = { hook: trimmed, songs: new Map() };
        byHook.set(key, entry);
      }
      entry.songs.set(song.id, song);
    }
  }

  const result: UnmappedHook[] = [...byHook.values()]
    .map((e) => ({ hook: e.hook, songs: [...e.songs.values()] }))
    .sort((a, b) => b.songs.length - a.songs.length || a.hook.localeCompare(b.hook));

  return Response.json(result);
}
