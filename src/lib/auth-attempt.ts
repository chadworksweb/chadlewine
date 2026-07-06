import { createAdminClient } from "@/lib/supabase-server";

export type AuthAction = "login" | "register" | "password_reset" | "admin_login";

/** Extract the client's IP from a Next request. Behind Cloudflare, le-nginx
   restores the real client via real_ip (CF-Connecting-IP) and passes it as the
   sole X-Forwarded-For entry, so the first entry is the trusted client IP. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export function clientUA(request: Request): string {
  return (request.headers.get("user-agent") || "").slice(0, 500);
}

export async function recordAttempt(opts: {
  email?: string | null;
  ip: string;
  user_agent?: string;
  action: AuthAction;
  success: boolean;
  reason?: string;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("auth_attempts").insert({
      email: opts.email ? opts.email.toLowerCase() : null,
      ip: opts.ip,
      user_agent: opts.user_agent || null,
      action: opts.action,
      success: opts.success,
      reason: opts.reason || null,
    });
  } catch (e) {
    // Logging must never block auth — swallow.
    console.error("[auth-attempt] insert failed", e);
  }
}
