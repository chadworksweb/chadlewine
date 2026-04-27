import { createAdminClient } from "@/lib/supabase-server";
import { syncPrintifyProducts } from "@/lib/printify-sync";

export async function POST() {
  const result = await syncPrintifyProducts(createAdminClient());
  if (!result.ok && result.error) {
    return Response.json(result, { status: result.fetched ? 207 : 500 });
  }
  return Response.json(result);
}
