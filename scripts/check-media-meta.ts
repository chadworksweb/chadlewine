import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
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

function pathOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\/+/, "").split("?")[0]);
  } catch {
    return url.replace(/^\/+/, "").split("?")[0];
  }
}
const base = (p: string) => p.split("/").pop() || p;

(async () => {
  const { data: meta } = await supabase.from("media_meta").select("filename");
  const metaKeys = (meta || []).map((m) => m.filename as string);
  const metaSet = new Set(metaKeys);

  // Real Bunny paths come from where content actually references the files.
  const sources: Array<[string, string]> = [
    ["art_pieces", "image_path"],
    ["observations", "art_image_path"],
    ["songs", "art_image_path"],
    ["albums", "cover_art_path"],
    ["products", "image_url"],
  ];
  const actualPaths = new Set<string>();
  for (const [table, col] of sources) {
    const { data } = await supabase.from(table).select(col);
    for (const row of (data || []) as Array<Record<string, string | null>>) {
      const p = pathOf(row[col]);
      if (p) actualPaths.add(p);
    }
  }

  const paths = [...actualPaths];
  const withFolder = paths.filter((p) => p.includes("/"));
  // Of the real paths, how many would the route find by EXACT key vs only basename?
  const exact = paths.filter((p) => metaSet.has(p)).length;
  const basenameOnly = paths.filter((p) => !metaSet.has(p) && metaSet.has(base(p)));

  console.log("media_meta keys:", metaKeys.length);
  console.log("metadata keys containing a folder '/':", metaKeys.filter((k) => k.includes("/")).length);
  console.log("\nreferenced content paths:", paths.length);
  console.log("  with a folder prefix:", withFolder.length);
  console.log("  found by EXACT key match (route works):", exact);
  console.log("  found ONLY by basename (route MISSES -> blank):", basenameOnly.length);
  console.log("\nexamples that miss (real path -> meta is keyed by basename):");
  console.table(
    basenameOnly.slice(0, 12).map((p) => ({ actual_path: p, meta_key: base(p) })),
  );
  console.log("\nsample folder paths:", withFolder.slice(0, 6));
})();
