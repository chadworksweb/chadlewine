import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

function tierForCharge(c: number): string {
  // RC tier bands by charge value (approx; violet high -> red low)
  if (c >= 50) return "violet";
  if (c >= 15) return "blue";
  if (c >= -15) return "green";
  if (c >= -50) return "orange";
  return "red";
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: releases } = await sb
    .from("releases")
    .select("id, title, release_date, release_type, status")
    .not("release_date", "is", null)
    .order("release_date");

  const { data: links } = await sb.from("release_songs").select("release_id, song_id");
  const { data: songs } = await sb.from("songs").select("id, rc_charge, instrumental");
  const chargeById = new Map(songs?.map(s => [s.id, s]));

  const byRelease = new Map<string, string[]>();
  links?.forEach(l => {
    const arr = byRelease.get(l.release_id) ?? [];
    arr.push(l.song_id);
    byRelease.set(l.release_id, arr);
  });

  console.log("RELEASE TRAJECTORY (chronological):\n");
  let plotted = 0;
  for (const r of releases ?? []) {
    const songIds = byRelease.get(r.id) ?? [];
    const charges = songIds
      .map(id => chargeById.get(id))
      .filter(s => s && !s.instrumental && s.rc_charge != null)
      .map(s => s!.rc_charge as number);
    const mean = charges.length ? charges.reduce((a, b) => a + b, 0) / charges.length : null;
    const chargeStr = mean == null ? "  --  " : mean.toFixed(1).padStart(6);
    const tier = mean == null ? "(no charge)" : tierForCharge(mean);
    if (mean != null) plotted++;
    console.log(
      `${(r.release_date as string).slice(0, 10)}  ${chargeStr}  ${tier.padEnd(7)}  ` +
      `[${(r.release_type ?? "?").padEnd(11)}] ${r.title}  (${charges.length}/${songIds.length} tracks charged)`
    );
  }
  console.log(`\nPlottable release points: ${plotted} / ${releases?.length} dated releases`);
}

main().catch(e => { console.error(e); process.exit(1); });
