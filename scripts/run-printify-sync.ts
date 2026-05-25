// One-off: run the real syncPrintifyProducts (insert-only, the "Import new
// from Printify" path) from the local working tree so it uses local code.
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { syncPrintifyProducts } from "../src/lib/printify-sync";

const envPath = path.resolve(__dirname, "../.env.local");
for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const result = await syncPrintifyProducts(supabase);
  console.log(JSON.stringify(result, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
