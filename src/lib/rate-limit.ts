import { createAdminClient } from "@/lib/supabase-server";
import type { AuthAction } from "@/lib/auth-attempt";

interface RateLimitResult {
  allowed: boolean;
  reason?: "too_many_email" | "too_many_ip" | "register_per_ip_hour";
  retryAfter?: number; // seconds
}

interface Window {
  minutes: number;
  byEmail?: number;       // null = no per-email cap
  byIp?: number;          // null = no per-ip cap
  failedOnly?: boolean;   // count only failed attempts
}

const POLICY: Record<AuthAction, Window[]> = {
  // Login: 5 failed per email per 15 min, 15 total per IP per 15 min.
  login: [
    { minutes: 15, byEmail: 5, failedOnly: true },
    { minutes: 15, byIp: 15 },
  ],
  // Admin login: stricter — secret URL but still rate-limit it.
  admin_login: [
    { minutes: 15, byEmail: 3, failedOnly: true },
    { minutes: 15, byIp: 10 },
  ],
  // Register: 5 per IP per hour (signup is rare).
  register: [
    { minutes: 60, byIp: 5 },
  ],
  // Password reset: 1 per email per 5 min (prevent reset-flood).
  password_reset: [
    { minutes: 5, byEmail: 1 },
  ],
};

export async function checkRateLimit(opts: {
  email?: string | null;
  ip: string;
  action: AuthAction;
}): Promise<RateLimitResult> {
  const supabase = createAdminClient();
  const windows = POLICY[opts.action];
  const normalizedEmail = opts.email ? opts.email.toLowerCase() : null;

  for (const w of windows) {
    const since = new Date(Date.now() - w.minutes * 60 * 1000).toISOString();

    if (w.byEmail !== undefined && normalizedEmail) {
      let q = supabase
        .from("auth_attempts")
        .select("id", { count: "exact", head: true })
        .eq("email", normalizedEmail)
        .eq("action", opts.action)
        .gte("created_at", since);
      if (w.failedOnly) q = q.eq("success", false);
      const { count } = await q;
      if ((count ?? 0) >= w.byEmail) {
        return {
          allowed: false,
          reason: "too_many_email",
          retryAfter: w.minutes * 60,
        };
      }
    }

    if (w.byIp !== undefined && opts.ip !== "unknown") {
      let q = supabase
        .from("auth_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip", opts.ip)
        .eq("action", opts.action)
        .gte("created_at", since);
      if (w.failedOnly) q = q.eq("success", false);
      const { count } = await q;
      if ((count ?? 0) >= w.byIp) {
        return {
          allowed: false,
          reason:
            opts.action === "register" ? "register_per_ip_hour" : "too_many_ip",
          retryAfter: w.minutes * 60,
        };
      }
    }
  }

  return { allowed: true };
}
