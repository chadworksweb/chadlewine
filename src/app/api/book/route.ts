import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { verifyTurnstile } from "@/lib/turnstile";
import { createAdminClient } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email";
import { grantStoreCoupon } from "@/lib/grant-coupon";
import {
  isRoomType,
  isExchange,
  isPaPlan,
  roomTypeLabel,
  exchangeLabel,
  paPlanLabel,
} from "@/lib/booking-options";

export const runtime = "nodejs";

const MIN_ELAPSED_MS = 2500; // forms filled faster than this are bots
const MAX_SETLIST = 60;
const MAX_COVERS = 8;

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : "").trim() || "unknown";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildBookingEmail(d: {
  name: string;
  email: string;
  phone: string;
  spaceName: string;
  location: string;
  roomType: string;
  paPlan: string;
  projection: string;
  capacity: string;
  dates: string;
  exchange: string;
  letChad: boolean;
  setlist: { title: string }[];
  covers: string[];
  message: string;
}): string {
  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:4px 12px 4px 0;color:#8b9cf7;font-size:13px;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:4px 0;color:#e0e0e8;font-size:14px;">${esc(value)}</td></tr>`
      : "";

  const setBlock = d.letChad
    ? '<p style="color:#a0a0b0;font-size:14px;margin:0;">Host asked Chad to pick the setlist for their room.</p>'
    : d.setlist.length
      ? `<ol style="margin:0;padding-left:20px;color:#e0e0e8;font-size:14px;line-height:1.7;">${d.setlist
          .map((s) => `<li>${esc(s.title)}</li>`)
          .join("")}</ol>`
      : '<p style="color:#808090;font-size:13px;margin:0;">No songs suggested.</p>';

  return `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#0a0a14;color:#e0e0e8;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;">
    <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 8px;">New booking inquiry</p>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 4px;color:#e0e0e8;">${esc(d.name)}</h1>
    <p style="font-size:13px;color:#808090;margin:0 0 20px;">${esc(d.spaceName || "(space not named)")}${d.location ? " &middot; " + esc(d.location) : ""}</p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
      ${row("Email", d.email)}${row("Phone", d.phone)}${row("Room type", d.roomType)}${row("PA", d.paPlan)}${row("Projection", d.projection)}${row("Capacity", d.capacity)}${row("Possible dates", d.dates)}${row("Exchange", d.exchange)}
    </table>
    <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 8px;">Suggested set</p>
    <div style="margin-bottom:20px;">${setBlock}</div>
    ${
      d.covers.length
        ? `<p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 8px;">Covers</p><p style="font-size:14px;color:#e0e0e8;line-height:1.6;margin:0 0 20px;">${esc(d.covers.join(", "))}</p>`
        : ""
    }
    ${
      d.message
        ? `<p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 8px;">Anything else</p><p style="font-size:14px;color:#e0e0e8;line-height:1.6;margin:0 0 20px;white-space:pre-wrap;">${esc(d.message)}</p>`
        : ""
    }
    <p style="font-size:11px;color:#606070;margin-top:32px;">Reply directly to this email to reach ${esc(d.name)}.</p>
  </div>
</body></html>`.trim();
}

// Compact recap of the inquiry, shown to the host at the top of their coupon
// email (above the thank-you). Trusted HTML -- values are escaped here.
function buildBookingSummaryHtml(d: {
  spaceName: string;
  location: string;
  roomType: string;
  paPlan: string;
  projection: string;
  capacity: string;
  dates: string;
  exchange: string;
  letChad: boolean;
  setlist: { title: string }[];
  covers: string[];
  message: string;
}): string {
  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:5px 14px 5px 0;color:#8b9cf7;font-size:12px;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:5px 0;color:#e0e0e8;font-size:13px;">${esc(value)}</td></tr>`
      : "";
  const setValue = d.letChad
    ? "Chad picks the setlist"
    : d.setlist.length
      ? d.setlist.map((s) => s.title).join(", ")
      : "None selected";
  return `
    <div style="border:1px solid rgba(139,156,247,0.25);border-radius:8px;padding:20px 22px;margin:0 0 28px;background:#0d0d16;">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#8b9cf7;margin:0 0 12px;">Your inquiry</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${row("Space", [d.spaceName, d.location].filter(Boolean).join(" -- "))}${row("Room", d.roomType)}${row("PA", d.paPlan)}${row("Projection", d.projection)}${row("Capacity", d.capacity)}${row("Dates", d.dates)}${row("Exchange", d.exchange)}${row("Set", setValue)}${row("Covers", d.covers.join(", "))}${row("Notes", d.message)}
      </table>
    </div>`;
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
  const str = (k: string, max: number) => ((form.get(k) as string) || "").trim().slice(0, max);
  const name = str("name", 200);
  const email = str("email", 200);
  const phone = str("phone", 60);
  const spaceName = str("spaceName", 200);
  const location = str("location", 200);
  const capacity = str("capacity", 60);
  const dates = str("dates", 300);
  const message = str("message", 4000);
  const roomTypeRaw = str("roomType", 60);
  const exchangeRaw = str("exchange", 60);
  const paPlanRaw = str("paPlan", 60);
  const roomType = isRoomType(roomTypeRaw) ? roomTypeRaw : null;
  const exchange = isExchange(exchangeRaw) ? exchangeRaw : null;
  const paPlan = isPaPlan(paPlanRaw) ? paPlanRaw : null;
  const hasProjector = (form.get("hasProjector") as string) === "yes";
  const hasScreen = (form.get("hasScreen") as string) === "yes";
  const projectionLabel = hasProjector
    ? hasScreen
      ? "Projector + screen"
      : "Projector, no screen"
    : hasScreen
      ? "Screen, no projector"
      : "No projection";
  const letChad = (form.get("letChad") as string) === "true";

  if (!name) {
    return NextResponse.json({ error: "Your name is required." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  // Setlist arrives as a JSON array of { id?, title }. Trust nothing: keep only
  // string titles, cap the count, drop empties.
  let setlist: { id?: string; title: string }[] = [];
  if (!letChad) {
    try {
      const raw = JSON.parse((form.get("setlist") as string) || "[]");
      if (Array.isArray(raw)) {
        setlist = raw
          .map((r) => ({
            id: typeof r?.id === "string" ? r.id : undefined,
            title: typeof r?.title === "string" ? r.title.trim().slice(0, 300) : "",
          }))
          .filter((r) => r.title)
          .slice(0, MAX_SETLIST);
      }
    } catch {
      setlist = [];
    }
  }

  // Covers arrive as a JSON array of strings (preset picks + custom entries).
  let covers: string[] = [];
  try {
    const raw = JSON.parse((form.get("covers") as string) || "[]");
    if (Array.isArray(raw)) {
      covers = raw
        .map((c) => (typeof c === "string" ? c.trim().slice(0, 200) : ""))
        .filter(Boolean)
        .slice(0, MAX_COVERS);
    }
  } catch {
    covers = [];
  }

  // 5. Persist.
  const supabase = createAdminClient();
  const id = randomUUID();
  const { error: insErr } = await supabase.from("booking_inquiries").insert({
    id,
    name,
    email,
    phone: phone || null,
    space_name: spaceName || null,
    location: location || null,
    room_type: roomType,
    pa_plan: paPlan,
    has_projector: hasProjector,
    has_screen: hasScreen,
    capacity: capacity || null,
    dates: dates || null,
    exchange,
    setlist,
    covers,
    let_chad: letChad,
    message: message || null,
    ip: clientIp(req),
    user_agent: req.headers.get("user-agent") || null,
    referer: req.headers.get("referer") || null,
  });
  if (insErr) {
    console.error("[book] insert failed", insErr);
    return NextResponse.json(
      { error: "Could not save your inquiry. Please try again." },
      { status: 500 },
    );
  }

  // Notify portal@. reply_to is the host so Chad can answer directly.
  await sendEmail({
    to: "portal@chadlewine.com",
    subject: `New booking inquiry: ${name}`,
    replyTo: email,
    html: buildBookingEmail({
      name,
      email,
      phone,
      spaceName,
      location,
      roomType: roomTypeLabel(roomType) || "",
      paPlan: paPlanLabel(paPlan) || "",
      projection: projectionLabel,
      capacity,
      dates,
      exchange: exchangeLabel(exchange) || "",
      letChad,
      setlist,
      covers,
      message,
    }),
  }).catch((e) => console.error("[book] email failed", e));

  // Reward the lead with the same 10% member coupon as the songwriting funnel
  // (distinct source key). Never let a coupon failure break the submission.
  await grantStoreCoupon({
    email,
    source: "inquiry_booking",
    percentOff: 10,
    daysValid: 30,
    emailSubject: "A 10% coupon from Chad - thanks for reaching out",
    eyebrow: "A thank-you from Chad",
    headline: "10% off the store",
    intro:
      "Thanks for reaching out about hosting a Super Individual Night. While I look at your space and dates, here's 10% off your next order - all music in your cart, or one merch item, whichever saves more.",
    redeemNote:
      'To use it: create a free account (or sign in) with this same email, add anything to your cart, then toggle on "Apply your coupon" right above the checkout button. One use, expires in 30 days.',
    footerNote:
      'You received this because you submitted a booking inquiry at chadlewine<span style="color:inherit;">.</span>com',
    ctaUrl: "https://chadlewine.com/account",
    ctaLabel: "Create your account",
    prependHtml: buildBookingSummaryHtml({
      spaceName,
      location,
      roomType: roomTypeLabel(roomType) || "",
      paPlan: paPlanLabel(paPlan) || "",
      projection: projectionLabel,
      capacity,
      dates,
      exchange: exchangeLabel(exchange) || "",
      letChad,
      setlist,
      covers,
      message,
    }),
  }).catch((e) => console.error("[book] coupon grant failed", e));

  return NextResponse.json({ ok: true });
}
