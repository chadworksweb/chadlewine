import { NextResponse } from "next/server";
import { getEventByCheckinToken, createCheckin, isValidEmail } from "@/lib/events";

export const runtime = "nodejs";

// Self-scan check-in. The venue QR carries the token; the fan confirms email.
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  }

  // Honeypot.
  if (((form.get("company") as string) || "").trim()) {
    return NextResponse.json({ ok: true, duplicate: false });
  }

  const token = ((form.get("token") as string) || "").trim();
  const email = ((form.get("email") as string) || "").trim();
  const name = ((form.get("name") as string) || "").trim();

  if (!token) return NextResponse.json({ error: "Missing check-in code." }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });

  const event = await getEventByCheckinToken(token);
  if (!event) return NextResponse.json({ error: "Check-in link is invalid." }, { status: 404 });
  if (!event.checkin_enabled) {
    return NextResponse.json({ error: "Check-in is not open for this event yet." }, { status: 400 });
  }

  const result = await createCheckin({ eventId: event.id, email, name: name || null });
  if (!result.ok) {
    return NextResponse.json({ error: "Could not check you in. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, duplicate: result.duplicate });
}
