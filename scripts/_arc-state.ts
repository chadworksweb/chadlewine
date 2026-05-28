import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: songs } = await sb.from("songs").select("id,title,slug,release_date,rc_charge").order("title");
  const total = songs?.length ?? 0;
  const withDate = songs?.filter(s => s.release_date).length ?? 0;
  const withCharge = songs?.filter(s => s.rc_charge !== null && s.rc_charge !== undefined).length ?? 0;
  const withBoth = songs?.filter(s => s.release_date && s.rc_charge !== null && s.rc_charge !== undefined).length ?? 0;
  console.log(`SONGS: total=${total} withReleaseDate=${withDate} withRcCharge=${withCharge} withBoth(compass points)=${withBoth}`);

  const missing = songs?.filter(s => s.rc_charge === null || s.rc_charge === undefined) ?? [];
  console.log(`\n${missing.length} songs STILL missing rc_charge (likely title mismatch vs RC):`);
  missing.forEach(s => console.log(`  - "${s.title}"  [slug: ${s.slug}]`));
}

main().catch(e => { console.error(e); process.exit(1); });
