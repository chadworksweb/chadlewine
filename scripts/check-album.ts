import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const [k, ...rest] = line.split("=");
    if (k && rest.length) process.env[k.trim()] = rest.join("=").trim();
  });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const slug = (process.argv[2] || "").trim().toLowerCase();
if (!slug) {
  console.error("Usage: npx tsx scripts/check-album.ts <slug>");
  process.exit(1);
}

(async () => {
  const { data: album } = await supabase
    .from("albums")
    .select("id, title, slug, price, download_path_mp3, download_path_flac, download_path_wav, cover_art_path, status")
    .eq("slug", slug)
    .maybeSingle();
  console.log("Album:", album || "(NOT FOUND)");

  if (album) {
    const { count: songCount } = await supabase
      .from("album_songs")
      .select("song_id", { count: "exact", head: true })
      .eq("album_id", album.id);
    console.log("\nSong count on album:", songCount);

    const { count: downloadableCount } = await supabase
      .from("album_songs")
      .select("songs!inner(download_path)", { count: "exact", head: true })
      .eq("album_id", album.id)
      .not("songs.download_path", "is", null);
    console.log("Songs with download_path:", downloadableCount);
  }
})();
