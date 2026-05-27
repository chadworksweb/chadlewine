import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { verifyTurnstile } from "@/lib/turnstile";
import { createAdminClient } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email";
import { isInquiryInterest, inquiryInterestLabel } from "@/lib/inquiry-interests";
import { grantStoreCoupon } from "@/lib/grant-coupon";

export const runtime = "nodejs";

const BUCKET = "inquiry-files";
const SIGNED_URL_TTL = 60 * 60 * 24 * 30; // 30 days

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildInquiryEmail(d: {
  name: string;
  email: string;
  phone: string;
  location: string;
  interest: string;
  links: { name: string; url: string }[];
}): string {
  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:4px 12px 4px 0;color:#8b9cf7;font-size:13px;">${label}</td><td style="padding:4px 0;color:#e0e0e8;font-size:14px;">${esc(value)}</td></tr>`
      : "";
  const fileLinks = d.links.length
    ? d.links
        .map(
          (l) =>
            `<a href="${l.url}" style="display:inline-block;margin:4px 8px 4px 0;padding:8px 14px;background:#8b9cf7;color:#0a0a14;text-decoration:none;border-radius:4px;font-size:12px;font-weight:600;">${esc(l.name)}</a>`,
        )
        .join("")
    : '<span style="color:#808090;font-size:13px;">No files.</span>';
  return `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#0a0a14;color:#e0e0e8;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;">
    <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 8px;">New songwriting inquiry</p>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 20px;color:#e0e0e8;">${esc(d.name)}</h1>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
      ${row("Email", d.email)}${row("Phone", d.phone)}${row("Location", d.location)}${row("Inquiring about", d.interest)}
    </table>
    <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 8px;">Files (links expire in 30 days)</p>
    <div>${fileLinks}</div>
    <p style="font-size:11px;color:#606070;margin-top:32px;">Reply directly to this email to reach ${esc(d.name)}.</p>
  </div>
</body></html>`.trim();
}

const MAX_FILES = 3;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file
const MIN_ELAPSED_MS = 2500; // forms filled faster than this are bots
const ALLOWED_TYPE = [/^audio\//, /^video\//, /^image\//, /^application\/pdf$/];

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
  const passed = await verifyTurnstile(form.get("turnstileToken") as string | null, clientIp(req));
  if (!passed) {
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 400 });
  }

  // 4. Field validation.
  const name = ((form.get("name") as string) || "").trim();
  const email = ((form.get("email") as string) || "").trim();
  const phone = ((form.get("phone") as string) || "").trim();
  const location = ((form.get("location") as string) || "").trim();
  const interestRaw = ((form.get("interest") as string) || "").trim();
  const interest = isInquiryInterest(interestRaw) ? interestRaw : null;

  if (!name || name.length > 200) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  // 5. File validation - 1..3 files, allowed types, size cap.
  const files = [form.get("file1"), form.get("file2"), form.get("file3")].filter(
    (f): f is File => f instanceof File && f.size > 0,
  );
  if (files.length === 0) {
    return NextResponse.json({ error: "Please attach at least one file." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: "A maximum of three files is allowed." }, { status: 400 });
  }
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `"${f.name}" is larger than 25 MB.` }, { status: 400 });
    }
    if (!ALLOWED_TYPE.some((re) => re.test(f.type))) {
      return NextResponse.json({ error: `"${f.name}" is not an accepted file type.` }, { status: 400 });
    }
  }

  // 6. Persist: upload files to a private bucket, insert the row, notify.
  const supabase = createAdminClient();
  const id = randomUUID();

  const stored: { path: string; name: string; type: string; size: number }[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "file";
    const path = `${id}/${i + 1}-${safe}`;
    const buf = Buffer.from(await f.arrayBuffer());
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buf, {
      contentType: f.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) {
      console.error("[inquire] upload failed", upErr);
      return NextResponse.json(
        { error: "Could not upload your files. Please try again." },
        { status: 500 },
      );
    }
    stored.push({ path, name: f.name, type: f.type, size: f.size });
  }

  const { error: insErr } = await supabase.from("inquiries").insert({
    id,
    name,
    email,
    phone: phone || null,
    location: location || null,
    interest,
    files: stored,
    ip: clientIp(req),
    user_agent: req.headers.get("user-agent") || null,
    referer: req.headers.get("referer") || null,
    source: ((form.get("source") as string) || "songwriting").slice(0, 80),
  });
  if (insErr) {
    console.error("[inquire] insert failed", insErr);
    return NextResponse.json(
      { error: "Could not save your inquiry. Please try again." },
      { status: 500 },
    );
  }

  // Signed links for the notification email.
  const links: { name: string; url: string }[] = [];
  for (const s of stored) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(s.path, SIGNED_URL_TTL);
    if (signed?.signedUrl) links.push({ name: s.name, url: signed.signedUrl });
  }

  // Notify portal@. reply_to is the inquirer so Chad can answer directly.
  await sendEmail({
    to: "portal@chadlewine.com",
    subject: `New songwriting inquiry: ${name}`,
    replyTo: email,
    html: buildInquiryEmail({
      name,
      email,
      phone,
      location,
      interest: inquiryInterestLabel(interest) || "",
      links,
    }),
  }).catch((e) => console.error("[inquire] email failed", e));

  // Reward the lead: a 10% member coupon (account-gated -- redeemed via the
  // "Apply your coupon" toggle after they sign in). The 20% post-purchase
  // member coupon still applies separately once they buy. Never let a coupon
  // failure break the inquiry submission.
  await grantStoreCoupon({
    email,
    source: "inquiry_songwriting",
    percentOff: 10,
    daysValid: 30,
    emailSubject: "A 10% coupon from Chad - thanks for reaching out",
    eyebrow: "A thank-you from Chad",
    headline: "10% off the store",
    intro:
      "Thanks for reaching out about songwriting. While I look over what you sent, here's 10% off your next order - all music in your cart, or one merch item, whichever saves more.",
    redeemNote:
      'To use it: create a free account (or sign in) with this same email, add anything to your cart, then toggle on "Apply your coupon" right above the checkout button. One use, expires in 30 days. Buy something and you\'ll unlock a separate 20% member coupon on top.',
    footerNote:
      'You received this because you submitted a songwriting inquiry at chadlewine<span style="color:inherit;">.</span>com',
    ctaUrl: "https://chadlewine.com/account",
    ctaLabel: "Create your account",
  }).catch((e) => console.error("[inquire] coupon grant failed", e));

  return NextResponse.json({ ok: true });
}
