import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: cols, error: e1 } = await sb.from("albums").select("*").limit(1);
  if (e1) console.log("albums error:", e1);
  else {
    console.log("albums sample row keys:", Object.keys(cols?.[0] || {}));
    console.log("first 1 row:", JSON.stringify(cols, null, 2));
  }

  const { data: all } = await sb.from("albums").select("id,slug,title,release_date,status").order("release_date", { ascending: false });
  console.log("\nALL ALBUMS (n=" + all?.length + "):");
  console.log(JSON.stringify(all, null, 2));

  const { data: rf } = await sb.from("release_formats").select("*");
  console.log("\nrelease_formats:", JSON.stringify(rf, null, 2));

  const { data: as } = await sb.from("album_songs").select("album_id,song_id,track_number,songs(slug,title)").limit(5);
  console.log("\nalbum_songs sample:", JSON.stringify(as, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
