import { createAdminClient } from "@/lib/supabase-server";
import { markdownToHtml } from "@/lib/markdown";
import { resolveAndMarkStale } from "@/lib/arc-stale";

type Patch = {
  title?: string;
  date_start?: string | null;
  date_end?: string | null;
  era_id?: string | null;
  status?: "draft" | "published";
  body_md?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  let body: Patch;
  try { body = (await request.json()) as Patch; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { data: existing } = await supabase
    .from("life_events")
    .select("id, slug, source")
    .eq("id", id)
    .single();
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const update: Record<string, unknown> = {};
  // A human edit supersedes the verbatim documentary import. Flip provenance to
  // "captured" so a later re-run of ingest-documentary-life-events.ts (which
  // upserts by slug with source='documentary') won't silently clobber the edit.
  if (existing.source === "documentary") update.source = "captured";
  if (typeof body.title === "string") update.title = body.title.trim();
  if ("date_start" in body) update.date_start = body.date_start;
  if ("date_end" in body) update.date_end = body.date_end;
  if ("era_id" in body) update.era_id = body.era_id;
  if (body.status === "draft" || body.status === "published") update.status = body.status;
  if (typeof body.body_md === "string") {
    update.body_md = body.body_md;
    update.body_html = await markdownToHtml(body.body_md);
  }

  if (Object.keys(update).length === 0) return Response.json({ error: "No fields to update" }, { status: 400 });

  const { data, error } = await supabase.from("life_events").update(update).eq("id", id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const stale = await resolveAndMarkStale(supabase, {
    entity_kind: "life_event",
    entity_id: data.id,
    entity_slug: data.slug,
    entity_title: data.title,
    action: "updated",
    date_start: data.date_start,
    date_end: data.date_end,
    era_id: data.era_id,
  });

  return Response.json({ row: data, sections_now_stale: stale });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("life_events")
    .select("id, slug, title, date_start, date_end, era_id, source")
    .eq("id", id)
    .single();
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("life_events").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const stale = await resolveAndMarkStale(supabase, {
    entity_kind: "life_event",
    entity_id: existing.id,
    entity_slug: existing.slug,
    entity_title: existing.title,
    action: "removed",
    date_start: existing.date_start,
    date_end: existing.date_end,
    era_id: existing.era_id,
  });

  return Response.json({ ok: true, sections_now_stale: stale });
}
