import { createAdminClient } from "@/lib/supabase-server";
import { syncPrintifyProducts, type SyncFieldFlags } from "@/lib/printify-sync";

interface Body {
  /** Scope the run to one product. Omit for the shop-wide insert-only sweep. */
  printify_product_id?: string;
  /** Which fields an existing row may take from Printify. Omit = insert-only. */
  fields?: SyncFieldFlags;
}

export async function POST(request: Request) {
  // The body is optional: the merch admin's shop-wide button posts nothing.
  let body: Body = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as Body;
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const onlyPrintifyId = body.printify_product_id?.trim() || undefined;
  const fields = body.fields;

  const result = await syncPrintifyProducts(createAdminClient(), {
    onlyPrintifyId,
    fields,
  });

  if (!result.ok && result.error) {
    return Response.json(result, { status: result.fetched ? 207 : 500 });
  }
  if (onlyPrintifyId && result.created === 0 && result.updated === 0 && result.skipped === 0) {
    return Response.json(
      { ...result, error: "Printify has no product with that id in this shop" },
      { status: 404 },
    );
  }
  return Response.json(result);
}
