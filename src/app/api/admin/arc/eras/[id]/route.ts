import { createAdminClient } from "@/lib/supabase-server";
import { resolveAndMarkStale } from "@/lib/arc-stale";

type Patch = {
  title?: string;
  kind?: "life" | "release";
  date_start?: string | null;
  date_end?: string | null;
  status?: "draft" | "published";
  body_md?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  let body: Patch;
  try { body = (await request.json()) as Patch; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  // Release-kind eras are owned by the album record (date_start = album
  // release window) and must be edited there. Block all mutations here so
  // the Nodes manager can't drift from album data.
  const { data: existing } = await supabase
    .from("eras")
    .select("id, kind, slug, release_id")
    .eq("id", id)
    .single();
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
  if (existing.kind === "release") {
    return Response.json({ error: "Release eras are owned by the album record. Edit at /admin/music/releases." }, { status: 403 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.title === "string") update.title = body.title.trim();
  if (body.kind === "life" || body.kind === "release") update.kind = body.kind;
  if ("date_start" in body) update.date_start = body.date_start;
  if ("date_end" in body) update.date_end = body.date_end;
  if (body.status === "draft" || body.status === "published") update.status = body.status;
  if (typeof body.body_md === "string") update.body_md = body.body_md;

  if (Object.keys(update).length === 0) return Response.json({ error: "No fields to update" }, { status: 400 });

  const { data, error } = await supabase.from("eras").update(update).eq("id", id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const stale = await resolveAndMarkStale(supabase, {
    entity_kind: "era",
    entity_id: data.id,
    entity_slug: data.slug,
    entity_title: data.title,
    action: "updated",
    date_start: data.date_start,
    date_end: data.date_end,
    era_id: data.id,
  });

  return Response.json({ row: data, sections_now_stale: stale });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: existing } = await supabase.from("eras").select("id, slug, title, kind, date_start, date_end").eq("id", id).single();
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
  if (existing.kind === "release") {
    return Response.json({ error: "Release eras are owned by the album record. Delete the album to remove its era." }, { status: 403 });
  }

  const { error } = await supabase.from("eras").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const stale = await resolveAndMarkStale(supabase, {
    entity_kind: "era",
    entity_id: existing.id,
    entity_slug: existing.slug,
    entity_title: existing.title,
    action: "removed",
    date_start: existing.date_start,
    date_end: existing.date_end,
    era_id: existing.id,
  });

  return Response.json({ ok: true, sections_now_stale: stale });
}
