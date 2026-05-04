import { createAdminClient } from "@/lib/supabase-server";
import { syncPrintifyProducts } from "@/lib/printify-sync";

// Statuses where we still benefit from fresh Printify product data:
//   pending_review / approved — admin is about to push or re-push
//   in_production / shipped   — Printify-side state may still flip (cancellations, restocks)
// Once delivered/completed/cancelled/refunded, we don't bother.
const ACTIVE_STATUSES = ["pending_review", "approved", "in_production", "shipped"];

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Vercel Cron sends Authorization: Bearer ${CRON_SECRET} when CRON_SECRET is
  // set. Reject any other caller so this endpoint isn't a public sync trigger.
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${expected}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createAdminClient();

  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("has_printify_lines", true)
    .in("status", ACTIVE_STATUSES);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!count || count === 0) {
    return Response.json({
      cron_skipped: true,
      reason: "no active printify orders",
    });
  }

  // Refresh images on all existing products (galleries respect needs_review +
  // is_hidden firewall via product_images). Title/description/variants stay
  // webhook-only — the cron should never overwrite curated copy or pricing.
  const result = await syncPrintifyProducts(supabase, {
    fields: { images: true },
  });
  return Response.json({
    cron_skipped: false,
    active_orders: count,
    sync: result,
  });
}
