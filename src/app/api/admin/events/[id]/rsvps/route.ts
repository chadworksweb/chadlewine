import { resolveEventId, listRsvpsForEvent } from "@/lib/events";

// GET /api/admin/events/[id]/rsvps -- RSVP list, or ?format=csv for export.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idOrSlug } = await params;
  const id = await resolveEventId(idOrSlug);
  if (!id) return Response.json({ error: "Event not found" }, { status: 404 });

  const rsvps = await listRsvpsForEvent(id);

  const format = new URL(request.url).searchParams.get("format");
  if (format === "csv") {
    const header = ["name", "email", "party_size", "note", "created_at"];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      header.join(","),
      ...rsvps.map((r) =>
        [r.name, r.email, r.party_size, r.note ?? "", r.created_at].map(escape).join(","),
      ),
    ];
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rsvps-${idOrSlug}.csv"`,
      },
    });
  }

  return Response.json(rsvps);
}
