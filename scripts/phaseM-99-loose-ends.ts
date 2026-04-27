import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const counts: Record<string, number | null> = {};

  const queries: Array<{ label: string; table: string; col: string; like: string }> = [
    { label: "songs.download_path → chadrising", table: "songs", col: "download_path", like: "%chadrising%" },
    { label: "songs.streaming_path → chadrising", table: "songs", col: "streaming_path", like: "%chadrising%" },
    { label: "songs.art_image_path → chadrising", table: "songs", col: "art_image_path", like: "%chadrising%" },
    { label: "songs.download_path_mp3 → chadrising", table: "songs", col: "download_path_mp3", like: "%chadrising%" },
    { label: "albums.cover_art_path → chadrising", table: "albums", col: "cover_art_path", like: "%chadrising%" },
    { label: "albums.download_path_mp3 → chadrising", table: "albums", col: "download_path_mp3", like: "%chadrising%" },
    { label: "purchases.download_url → chadrising", table: "purchases", col: "download_url", like: "%chadrising%" },
  ];

  for (const q of queries) {
    const { count, error } = await sb.from(q.table).select(q.col, { count: "exact", head: true }).like(q.col, q.like);
    counts[q.label] = error ? null : count ?? 0;
  }

  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${v === null ? " ?" : String(v).padStart(2)}  ${k}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
