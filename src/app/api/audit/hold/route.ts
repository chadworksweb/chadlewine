import { NextResponse } from "next/server";
import { verifyTurnstile } from "@/lib/turnstile";
import { createAdminClient } from "@/lib/supabase-server";
import { createAuditHoldSession } from "@/lib/stripe";
import { AUDIT_LAUNCH_ACTIVE, auditHoldCents } from "@/lib/audit-rate";
import { AUDIT_AGREEMENT_VERSION } from "@/lib/audit-agreement";

export const runtime = "nodejs";

const MIN_ELAPSED_MS = 2500; // forms filled faster than this are bots

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : "").trim() || "unknown";
}

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://chadlewine.com"
  );
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  }

  // 1. Honeypot - hidden field must be empty. If filled, pretend success.
  if (((form.get("company") as string) || "").trim()) {
    return NextResponse.json({ ok: true });
  }

  // 2. Time-trap - a real person takes more than a couple seconds.
  const elapsed = Number(form.get("elapsedMs") || 0);
  if (!Number.isFinite(elapsed) || elapsed < MIN_ELAPSED_MS) {
    return NextResponse.json({ ok: true }); // silent drop
  }

  // 3. Cloudflare Turnstile (no-op if TURNSTILE_SECRET_KEY unset).
  const passed = await verifyTurnstile(
    form.get("turnstileToken") as string | null,
    clientIp(req)
  );
  if (!passed) {
    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 400 }
    );
  }

  // 4. Fields.
  const str = (k: string, max: number) =>
    ((form.get(k) as string) || "").trim().slice(0, max);
  const email = str("email", 200);
  const name = str("name", 200);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { error: "That email address does not look right." },
      { status: 400 }
    );
  }

  // 5. The agreement. Hard gate, not a formality: it is the only place the
  // client is told they track their own time. Never infer acceptance -- if the
  // box is not checked, there is no hold.
  if (str("agreement", 10) !== "on") {
    return NextResponse.json(
      { error: "You have to agree to the terms before holding a session." },
      { status: 400 }
    );
  }

  const launch = AUDIT_LAUNCH_ACTIVE;
  const holdCents = auditHoldCents(launch);

  // Reuse the Stripe customer when this email is already in the audience, so
  // the audit attaches to the same Customer record as their other purchases.
  const supabase = createAdminClient();
  const { data: audience } = await supabase
    .from("audience")
    .select("id, stripe_customer_id")
    .ilike("email", email)
    .maybeSingle();

  try {
    const session = await createAuditHoldSession({
      hold_cents: holdCents,
      email,
      name: name || undefined,
      agreement_version: AUDIT_AGREEMENT_VERSION,
      customer: audience?.stripe_customer_id || undefined,
      success_url: `${siteUrl()}/sovereignty-audit/confirmed?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/sovereignty-audit`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Could not start checkout. Try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    console.error("[audit/hold] checkout create failed", err);
    return NextResponse.json(
      { error: "Could not start checkout. Try again." },
      { status: 502 }
    );
  }
}
