import { createAdminClient } from "@/lib/supabase-server";
import {
  MODAL_SETTING_KEYS,
  MODAL_THRESHOLDS,
  clampInt,
  parseAdminIps,
} from "@/lib/subscribe-modal";

// Admin control surface for the subscribe modal. GET returns the three
// site_settings rows plus the caller's detected IP (so the admin page can
// one-click capture Chad's IP for the exclusion list). PUT upserts the rows.

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : "").trim();
}

export async function GET(request: Request) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", Object.values(MODAL_SETTING_KEYS));
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const map: Record<string, string> = {};
  for (const row of data || []) map[row.key] = row.value;

  return Response.json({
    enabled: map[MODAL_SETTING_KEYS.enabled] === "true",
    test_mode: map[MODAL_SETTING_KEYS.testMode] === "true",
    admin_ips: parseAdminIps(map[MODAL_SETTING_KEYS.adminIps]),
    dwell_seconds: clampInt(
      map[MODAL_SETTING_KEYS.dwellSeconds],
      MODAL_THRESHOLDS.dwellSeconds
    ),
    cart_dwell_seconds: clampInt(
      map[MODAL_SETTING_KEYS.cartDwellSeconds],
      MODAL_THRESHOLDS.cartDwellSeconds
    ),
    scroll_depth_pct: clampInt(
      map[MODAL_SETTING_KEYS.scrollDepthPct],
      MODAL_THRESHOLDS.scrollDepthPct
    ),
    reshow_days: clampInt(
      map[MODAL_SETTING_KEYS.reshowDays],
      MODAL_THRESHOLDS.reshowDays
    ),
    bounds: MODAL_THRESHOLDS,
    your_ip: clientIp(request),
  });
}

export async function PUT(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();

  const updates: { key: string; value: string }[] = [];
  if (typeof body.enabled === "boolean") {
    updates.push({ key: MODAL_SETTING_KEYS.enabled, value: String(body.enabled) });
  }
  if (typeof body.test_mode === "boolean") {
    updates.push({ key: MODAL_SETTING_KEYS.testMode, value: String(body.test_mode) });
  }
  if (Array.isArray(body.admin_ips)) {
    const cleaned = parseAdminIps(body.admin_ips.join(","));
    updates.push({ key: MODAL_SETTING_KEYS.adminIps, value: cleaned.join(",") });
  }
  const numeric: [string, string, keyof typeof MODAL_THRESHOLDS][] = [
    ["dwell_seconds", MODAL_SETTING_KEYS.dwellSeconds, "dwellSeconds"],
    ["cart_dwell_seconds", MODAL_SETTING_KEYS.cartDwellSeconds, "cartDwellSeconds"],
    ["scroll_depth_pct", MODAL_SETTING_KEYS.scrollDepthPct, "scrollDepthPct"],
    ["reshow_days", MODAL_SETTING_KEYS.reshowDays, "reshowDays"],
  ];
  for (const [bodyKey, settingKey, boundsKey] of numeric) {
    if (body[bodyKey] !== undefined && body[bodyKey] !== null && body[bodyKey] !== "") {
      const value = clampInt(body[bodyKey], MODAL_THRESHOLDS[boundsKey]);
      updates.push({ key: settingKey, value: String(value) });
    }
  }

  if (updates.length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  for (const { key, value } of updates) {
    const { error } = await supabase
      .from("site_settings")
      .upsert(
        { key, value, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
