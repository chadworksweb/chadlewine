import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { count: before } = await sb
    .from("songs")
    .select("id", { count: "exact", head: true })
    .like("download_path", "%chadrising%");
  console.log(`Before: ${before ?? 0} rows`);

  const { error } = await sb
    .from("songs")
    .update({ download_path: null })
    .like("download_path", "%chadrising%");
  if (error) throw error;

  const { count: after } = await sb
    .from("songs")
    .select("id", { count: "exact", head: true })
    .like("download_path", "%chadrising%");
  console.log(`After:  ${after ?? 0} rows still match chadrising`);
}

main().catch((e) => { console.error(e); process.exit(1); });
