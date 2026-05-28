import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env.local");
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

(async () => {
  const { data } = await supabase
    .from("product_images")
    .select("product_id, is_hidden, source, deleted_at, merch:merch!inner(slug, title, status)")
    .eq("is_hidden", true)
    .is("deleted_at", null);

  type Row = { product_id: string; source: string; merch: { slug: string; title: string; status: string } | null };
  const rows = (data || []) as unknown as Row[];
  const byProd = new Map<string, { slug: string; title: string; count: number }>();
  for (const r of rows) {
    if (!r.merch || r.merch.status !== "active") continue;
    const cur = byProd.get(r.product_id) || { slug: r.merch.slug, title: r.merch.title, count: 0 };
    cur.count++;
    byProd.set(r.product_id, cur);
  }
  console.log(`Active products with one or more hidden Printify images: ${byProd.size}`);
  for (const [pid, info] of byProd.entries()) {
    console.log(`  ${info.count}  /merch/${info.slug}  (${pid})`);
  }
})();
