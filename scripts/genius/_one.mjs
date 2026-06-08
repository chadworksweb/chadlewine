import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await supabase.from("songs").select("title,song_summary,citation_summary,chad_quote,if_you_like_blurb").eq("slug","1-dance").limit(1);
const s = data[0]||{};
for (const k of ["song_summary","citation_summary","chad_quote","if_you_like_blurb"]) {
  console.log(`\n=== ${k} ===\n${s[k] ?? "(null)"}`);
}
