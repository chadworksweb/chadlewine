import { resolveEventId, listCheckinsForEvent } from "@/lib/events";

// GET /api/admin/events/[id]/checkins -- check-in (attendance) list.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idOrSlug } = await params;
  const id = await resolveEventId(idOrSlug);
  if (!id) return Response.json({ error: "Event not found" }, { status: 404 });

  const checkins = await listCheckinsForEvent(id);
  return Response.json(checkins);
}
