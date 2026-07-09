import { createAdminClient } from "@/lib/supabase-server";
import { captureSlugChange } from "@/lib/redirects";
import {
  getEventForAdmin,
  resolveEventId,
  normalizeEventSlug,
  EVENT_WRITABLE_FIELDS,
} from "@/lib/events";

// GET /api/admin/events/[id] -- single event record.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const event = await getEventForAdmin(id);
  if (!event) return Response.json({ error: "Event not found" }, { status: 404 });
  return Response.json({ event });
}

// PUT /api/admin/events/[id] -- update writable fields (matches useAutosave).
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idOrSlug } = await params;
  const db = createAdminClient();
  const id = await resolveEventId(idOrSlug);
  if (!id) return Response.json({ error: "Event not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  for (const f of EVENT_WRITABLE_FIELDS) {
    if (f in body) updates[f] = body[f];
  }

  if (typeof updates.slug === "string") {
    const normalized = normalizeEventSlug(updates.slug);
    if (!normalized) return Response.json({ error: "slug cannot be empty" }, { status: 400 });
    updates.slug = normalized;
  }

  // Empty strings -> null for optional scalar fields so they clear cleanly.
  for (const key of ["starts_at", "ends_at", "capacity"]) {
    if (updates[key] === "") updates[key] = null;
  }
  if (updates.capacity != null && updates.capacity !== null) {
    const n = Number(updates.capacity);
    updates.capacity = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }

  const { data: prev } = await db.from("events").select("slug").eq("id", id).single();

  const { data, error } = await db
    .from("events")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return Response.json({ error: error.message }, { status });
  }

  // Preserve link equity on slug change (301 /irl/<old> -> /irl/<new>).
  if (typeof updates.slug === "string" && prev?.slug && prev.slug !== updates.slug) {
    await captureSlugChange(`/irl/${prev.slug}`, `/irl/${updates.slug}`, "event", id);
  }

  return Response.json(data);
}

// DELETE /api/admin/events/[id] -- removes the event; rsvps + checkins cascade.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idOrSlug } = await params;
  const db = createAdminClient();
  const id = await resolveEventId(idOrSlug);
  if (!id) return Response.json({ error: "Event not found" }, { status: 404 });

  const { error } = await db.from("events").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
