import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await sb.from("release_formats").select("id,label,slug");
  if (error) throw error;

  for (const r of data!) {
    if (!r.label) continue;
    const cleaned = r.label.replace(/^Digital\s+/i, "").trim();
    if (cleaned !== r.label) {
      const { error: e } = await sb.from("release_formats").update({ label: cleaned }).eq("id", r.id);
      if (e) throw e;
      console.log(`${r.slug.padEnd(25)} | ${r.label} → ${cleaned}`);
    } else {
      console.log(`${r.slug.padEnd(25)} | ${r.label} (unchanged)`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
