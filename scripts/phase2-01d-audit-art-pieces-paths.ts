import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data } = await supabase.from("art_pieces").select("id, image_path");
  const rows = (data ?? []).filter(
    (r) => typeof r.image_path === "string" && r.image_path.length > 0
  );
  console.log(`${rows.length} art_pieces rows with image_path\n`);

  const prefixes = new Map<string, number>();
  const dupes = new Map<string, string[]>();
  for (const r of rows) {
    const u = new URL(r.image_path);
    const parts = u.pathname.replace(/^\/+/, "").split("/");
    const prefix = parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
    prefixes.set(prefix, (prefixes.get(prefix) ?? 0) + 1);
    const filename = parts[parts.length - 1];
    dupes.set(filename, [...(dupes.get(filename) ?? []), u.pathname]);
  }

  console.log("subfolders on chadrising-art:");
  for (const [p, c] of prefixes) console.log(`  ${p}: ${c}`);

  const collisions = [...dupes.entries()].filter(([, v]) => v.length > 1);
  console.log(`\nfilename collisions if flattened: ${collisions.length}`);
  for (const [f, ps] of collisions.slice(0, 10)) console.log(`  ${f}: ${ps.join(", ")}`);

  // Also show hostname distribution — confirm all on chadrising-art
  const hosts = new Map<string, number>();
  for (const r of rows) {
    const u = new URL(r.image_path);
    hosts.set(u.hostname, (hosts.get(u.hostname) ?? 0) + 1);
  }
  console.log("\nhostnames:");
  for (const [h, c] of hosts) console.log(`  ${h}: ${c}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
