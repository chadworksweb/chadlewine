import { createAdminClient } from "@/lib/supabase-server";
import { resolveEventId, generateCheckinToken } from "@/lib/events";

// POST /api/admin/events/[id]/checkin-token -- rotate the venue-QR token.
// Invalidates any previously printed QR for the event.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idOrSlug } = await params;
  const db = createAdminClient();
  const id = await resolveEventId(idOrSlug);
  if (!id) return Response.json({ error: "Event not found" }, { status: 404 });

  const token = generateCheckinToken();
  const { error } = await db.from("events").update({ checkin_token: token }).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ checkin_token: token });
}
