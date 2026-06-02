import { createPublicClient } from "@/lib/supabase-server";

/* Server-side config for the engagement-triggered subscribe modal.
   Stored as rows in the site_settings key/value table so it can be toggled and
   tuned from the admin UI without a deploy. The (public) layout reads this to
   decide whether to mount <SubscribeModalController> and with what thresholds. */

export const MODAL_SETTING_KEYS = {
  enabled: "subscribe_modal_enabled",
  testMode: "subscribe_modal_test_mode",
  adminIps: "subscribe_modal_admin_ips",
  dwellSeconds: "subscribe_modal_dwell_seconds",
  cartDwellSeconds: "subscribe_modal_cart_dwell_seconds",
  scrollDepthPct: "subscribe_modal_scroll_depth_pct",
  reshowDays: "subscribe_modal_reshow_days",
} as const;

// Defaults + sane bounds for the numeric thresholds. Bounds are enforced on
// both read and write so a bad admin entry can never break the trigger logic.
export const MODAL_THRESHOLDS = {
  dwellSeconds: { default: 40, min: 5, max: 600 },
  cartDwellSeconds: { default: 15, min: 3, max: 600 },
  scrollDepthPct: { default: 60, min: 10, max: 100 },
  reshowDays: { default: 14, min: 0, max: 365 },
} as const;

export interface SubscribeModalConfig {
  enabled: boolean;
  testMode: boolean;
  adminIps: string[];
  dwellSeconds: number;
  cartDwellSeconds: number;
  scrollDepthPct: number;
  reshowDays: number;
}

export function parseAdminIps(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
}

// Parse an integer setting, clamping to bounds and falling back to the default
// for blank/non-numeric values.
export function clampInt(
  raw: string | number | null | undefined,
  bounds: { default: number; min: number; max: number }
): number {
  const n =
    typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return bounds.default;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(n)));
}

export async function getSubscribeModalConfig(): Promise<SubscribeModalConfig> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", Object.values(MODAL_SETTING_KEYS));

  const map: Record<string, string> = {};
  for (const row of data || []) map[row.key] = row.value;

  return {
    enabled: map[MODAL_SETTING_KEYS.enabled] === "true",
    testMode: map[MODAL_SETTING_KEYS.testMode] === "true",
    adminIps: parseAdminIps(map[MODAL_SETTING_KEYS.adminIps]),
    dwellSeconds: clampInt(
      map[MODAL_SETTING_KEYS.dwellSeconds],
      MODAL_THRESHOLDS.dwellSeconds
    ),
    cartDwellSeconds: clampInt(
      map[MODAL_SETTING_KEYS.cartDwellSeconds],
      MODAL_THRESHOLDS.cartDwellSeconds
    ),
    scrollDepthPct: clampInt(
      map[MODAL_SETTING_KEYS.scrollDepthPct],
      MODAL_THRESHOLDS.scrollDepthPct
    ),
    reshowDays: clampInt(
      map[MODAL_SETTING_KEYS.reshowDays],
      MODAL_THRESHOLDS.reshowDays
    ),
  };
}
