import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { count: total } = await sb.from("songs").select("id", { count: "exact", head: true });
  const { count: nullDur } = await sb
    .from("songs")
    .select("id", { count: "exact", head: true })
    .is("duration_seconds", null);
  const { count: nullDurWithStream } = await sb
    .from("songs")
    .select("id", { count: "exact", head: true })
    .is("duration_seconds", null)
    .not("streaming_path", "is", null);

  console.log(`total songs:                              ${total}`);
  console.log(`null duration_seconds:                    ${nullDur}`);
  console.log(`null duration AND has streaming_path:     ${nullDurWithStream}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
