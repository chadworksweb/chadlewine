/** Cloudflare Turnstile server-side verification.
   If TURNSTILE_SECRET_KEY isn't set, returns true (no-op) so deployments
   without Turnstile configured still work. */

export async function verifyTurnstile(
  token: string | null | undefined,
  ip: string
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // Turnstile not configured — let through.
  if (!token) return false;

  try {
    const body = new URLSearchParams();
    body.append("secret", secret);
    body.append("response", token);
    if (ip && ip !== "unknown") body.append("remoteip", ip);

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }
    );
    if (!res.ok) {
      console.error("[turnstile] siteverify HTTP error", res.status);
      return false;
    }
    const data = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };
    if (!data.success) {
      // Cloudflare's error-codes are the only way to tell a rotated secret
      // (invalid-input-secret) from a replayed token (timeout-or-duplicate)
      // from a widget that never issued one (missing-input-response). Losing
      // them turned a one-minute fix into an hour of guessing on 2026-08-11.
      console.error(
        "[turnstile] verify rejected",
        JSON.stringify(data["error-codes"] ?? []),
      );
    }
    return !!data.success;
  } catch (e) {
    console.error("[turnstile] verify failed", e);
    return false;
  }
}
