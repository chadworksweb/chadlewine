import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase-server";
import { createRsvp, isValidEmail } from "@/lib/events";
import { isLikelyBotUserAgent } from "@/lib/bot-detection";

export const runtime = "nodejs";

const MIN_ELAPSED_MS = 2500; // faster than this = bot

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  }

  // 1. Honeypot -- hidden field must be empty. If filled, pretend success.
  if (((form.get("company") as string) || "").trim()) {
    return NextResponse.json({ ok: true, duplicate: false });
  }

  // 2. Time-trap -- a real person takes more than a couple seconds.
  const elapsed = Number(form.get("elapsedMs") || 0);
  if (!Number.isFinite(elapsed) || elapsed < MIN_ELAPSED_MS) {
    return NextResponse.json({ ok: true, duplicate: false }); // silent drop
  }

  // 3. Obvious bot user-agents.
  if (isLikelyBotUserAgent(req.headers.get("user-agent"))) {
    return NextResponse.json({ ok: true, duplicate: false });
  }

  // 4. Validate.
  const eventId = ((form.get("eventId") as string) || "").trim();
  const name = ((form.get("name") as string) || "").trim();
  const email = ((form.get("email") as string) || "").trim();
  const note = ((form.get("note") as string) || "").trim();
  const partySize = Number(form.get("party_size") || 1);

  if (!eventId) return NextResponse.json({ error: "Missing event." }, { status: 400 });
  if (!name || name.length > 200) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });

  // 5. Confirm the event is published and accepting RSVPs (anon RLS read).
  const db = createPublicClient();
  const { data: event } = await db
    .from("events")
    .select("id, rsvp_enabled")
    .eq("id", eventId)
    .eq("status", "published")
    .maybeSingle();

  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  if (!event.rsvp_enabled) return NextResponse.json({ error: "RSVPs are closed for this event." }, { status: 400 });

  // 6. Insert (service role; deduped per event + email).
  const result = await createRsvp({ eventId, name, email, partySize, note });
  if (!result.ok) {
    return NextResponse.json({ error: "Could not save your RSVP. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, duplicate: result.duplicate });
}
