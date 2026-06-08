import { NextResponse } from "next/server";
import { verifyTurnstile } from "@/lib/turnstile";
import { ingestInboundMessage } from "@/lib/inbound";

// Public contact form -> front desk. Same anti-spam stack as /api/inquire
// (honeypot + time-trap + Turnstile), but instead of emailing Chad directly
// the message is triaged and routed into the admin inbox. Only positive notes
// and real opportunities ping him.

export const runtime = "nodejs";

const MIN_ELAPSED_MS = 2500; // forms filled faster than this are bots

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : "").trim() || "unknown";
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  }

  // 1. Honeypot -- hidden field must be empty. If filled, pretend success.
  if (((form.get("company") as string) || "").trim()) {
    return NextResponse.json({ ok: true });
  }

  // 2. Time-trap -- a real person takes more than a couple seconds.
  const elapsed = Number(form.get("elapsedMs") || 0);
  if (!Number.isFinite(elapsed) || elapsed < MIN_ELAPSED_MS) {
    return NextResponse.json({ ok: true }); // silent drop
  }

  // 3. Cloudflare Turnstile (no-op if TURNSTILE_SECRET_KEY unset).
  const passed = await verifyTurnstile(form.get("turnstileToken") as string | null, clientIp(req));
  if (!passed) {
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 400 });
  }

  // 4. Field validation.
  const name = ((form.get("name") as string) || "").trim();
  const email = ((form.get("email") as string) || "").trim();
  const subject = ((form.get("subject") as string) || "").trim();
  const message = ((form.get("message") as string) || "").trim();

  if (!name || name.length > 200) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Please write a message." }, { status: 400 });
  }
  if (message.length > 6000) {
    return NextResponse.json({ error: "That message is too long." }, { status: 400 });
  }

  // 5. Ingest: insert + triage + (maybe) ping. Never leak triage errors to the
  // sender -- they always get a clean acknowledgement.
  try {
    await ingestInboundMessage({
      channel: "contact_form",
      from_email: email,
      from_name: name,
      subject: subject || null,
      body: message,
      raw: { name, email, subject, message },
      ip: clientIp(req),
      user_agent: req.headers.get("user-agent") || null,
      referer: req.headers.get("referer") || null,
      source: "contact_form",
    });
  } catch (e) {
    console.error("[contact] ingest failed", e);
    return NextResponse.json({ error: "Could not send your message. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
