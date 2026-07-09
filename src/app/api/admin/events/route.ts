import { createAdminClient } from "@/lib/supabase-server";
import {
  listEventsForAdmin,
  normalizeEventSlug,
  generateCheckinToken,
} from "@/lib/events";
import { isReservedSlug } from "@/lib/reserved-slugs";

// GET /api/admin/events -- list with RSVP + check-in counts.
export async function GET() {
  try {
    const events = await listEventsForAdmin();
    return Response.json(events);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/admin/events -- create an event (record only; edited after).
export async function POST(request: Request) {
  const db = createAdminClient();
  const body = await request.json().catch(() => ({}));

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return Response.json({ error: "title is required" }, { status: 400 });

  let slug = normalizeEventSlug(body.slug || title);
  if (!slug) return Response.json({ error: "slug is required" }, { status: 400 });
  // Event slugs live under /irl/<slug> so a top-level reserved slug is fine,
  // but guard the obvious ones anyway to avoid confusing routes.
  if (isReservedSlug(slug)) slug = `${slug}-event`;

  const { data, error } = await db
    .from("events")
    .insert({
      slug,
      title,
      status: body.status === "published" ? "published" : "draft",
      checkin_token: generateCheckinToken(),
    })
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500; // unique_violation
    return Response.json({ error: error.message }, { status });
  }
  return Response.json(data, { status: 201 });
}
