import { createAdminClient } from "@/lib/supabase-server";
import { clampInt } from "@/lib/subscribe-modal";
import {
  CART_RECOVERY_KEYS,
  CART_RECOVERY_DELAY,
  CART_RECOVERY_DISCOUNT,
  runCartRecovery,
} from "@/lib/cart-recovery";

// Admin control surface for abandoned-cart recovery. GET returns the settings,
// bounds, and recent sends. PUT writes the three site_settings keys. POST runs an
// on-demand DRY RUN preview (never live-sends from the button).

export async function GET() {
  const supabase = createAdminClient();
  const [{ data: settingsRows }, { data: recent }] = await Promise.all([
    supabase.from("site_settings").select("key, value").in("key", Object.values(CART_RECOVERY_KEYS)),
    supabase
      .from("cart_recovery_emails")
      .select("email, cart_total, item_count, status, sent_at, coupon_code, discount_percent")
      .order("sent_at", { ascending: false })
      .limit(25),
  ]);

  const map: Record<string, string> = {};
  for (const row of settingsRows || []) map[row.key] = row.value;

  return Response.json({
    enabled: map[CART_RECOVERY_KEYS.enabled] === "true",
    test_mode: map[CART_RECOVERY_KEYS.testMode] === "true",
    delay_hours: clampInt(map[CART_RECOVERY_KEYS.delayHours], CART_RECOVERY_DELAY),
    delay_bounds: CART_RECOVERY_DELAY,
    discount_percent: clampInt(
      map[CART_RECOVERY_KEYS.discountPercent] ?? String(CART_RECOVERY_DISCOUNT.default),
      CART_RECOVERY_DISCOUNT
    ),
    discount_bounds: CART_RECOVERY_DISCOUNT,
    recent: recent || [],
  });
}

export async function PUT(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();

  const updates: { key: string; value: string }[] = [];
  if (typeof body.enabled === "boolean") {
    updates.push({ key: CART_RECOVERY_KEYS.enabled, value: String(body.enabled) });
  }
  if (typeof body.test_mode === "boolean") {
    updates.push({ key: CART_RECOVERY_KEYS.testMode, value: String(body.test_mode) });
  }
  if (body.delay_hours !== undefined && body.delay_hours !== null && body.delay_hours !== "") {
    updates.push({
      key: CART_RECOVERY_KEYS.delayHours,
      value: String(clampInt(body.delay_hours, CART_RECOVERY_DELAY)),
    });
  }
  if (body.discount_percent !== undefined && body.discount_percent !== null && body.discount_percent !== "") {
    updates.push({
      key: CART_RECOVERY_KEYS.discountPercent,
      value: String(clampInt(body.discount_percent, CART_RECOVERY_DISCOUNT)),
    });
  }

  if (updates.length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  for (const { key, value } of updates) {
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body.action !== "run") {
    return Response.json({ error: "Unknown action" }, { status: 400 });
  }
  // Preview only: never live-sends from the admin button.
  const summary = await runCartRecovery({ dryRun: true });
  return Response.json(summary);
}
