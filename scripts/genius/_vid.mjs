import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from("videos").select("*");
if (error) { console.error("videos query error:", error.message); process.exit(1); }
console.log("video rows:", data.length);
if (data[0]) console.log("COLUMNS:", Object.keys(data[0]).join(", "));
console.log("\n--- videos ---");
for (const v of data) {
  console.log(`${v.title ?? v.name ?? "(untitled)"}  | slug=${v.slug ?? "-"} | song_id=${v.song_id ?? "NULL"}`);
}
