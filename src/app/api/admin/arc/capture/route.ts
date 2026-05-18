import { createAdminClient } from "@/lib/supabase-server";
import { markdownToHtml } from "@/lib/markdown";
import { slugify } from "@/lib/utils";
import { resolveAndMarkStale, type StaleAction } from "@/lib/arc-stale";

type CapturePayload = {
  entity_kind:
    | "life_event"
    | "era"
    | "song_state_change"
    | "relationship"
    | "geography_band"
    | "thematic_thread"
    | "industry_encounter"
    | "art_piece_date_update"
    | "prose_section_scope_update";
  payload: Record<string, unknown>;
};

export async function POST(request: Request) {
  let body: CapturePayload;
  try {
    body = (await request.json()) as CapturePayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { entity_kind, payload } = body;
  if (!entity_kind || !payload) {
    return Response.json({ error: "entity_kind and payload required" }, { status: 400 });
  }

  try {
    switch (entity_kind) {
      case "life_event":      return await captureLifeEvent(supabase, payload);
      case "era":             return await captureEra(supabase, payload);
      case "song_state_change": return await captureSongStateChange(supabase, payload);
      case "relationship":    return await captureRelationship(supabase, payload);
      case "geography_band":  return await captureGeographyBand(supabase, payload);
      case "thematic_thread": return await captureThematicThread(supabase, payload);
      case "industry_encounter": return await captureIndustryEncounter(supabase, payload);
      case "art_piece_date_update": return await captureArtPieceDate(supabase, payload);
      case "prose_section_scope_update": return await captureProseSectionScope(supabase, payload);
      default:
        return Response.json({ error: `Unknown entity_kind: ${entity_kind}` }, { status: 400 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

// ---------- Helpers ----------

type Sb = ReturnType<typeof createAdminClient>;

async function ok(row: unknown, sectionsNowStale: string[]) {
  return Response.json({ row, sections_now_stale: sectionsNowStale }, { status: 201 });
}

function reqStr(p: Record<string, unknown>, k: string): string {
  const v = p[k];
  if (typeof v !== "string" || !v.trim()) throw new Error(`${k} required`);
  return v.trim();
}
function optStr(p: Record<string, unknown>, k: string): string | null {
  const v = p[k];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function optDate(p: Record<string, unknown>, k: string): string | null {
  const v = optStr(p, k);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

// ---------- Life event ----------

async function captureLifeEvent(supabase: Sb, p: Record<string, unknown>) {
  const title = reqStr(p, "title");
  const slug = optStr(p, "slug") || slugify(title);
  const body_md = optStr(p, "body_md") || "";
  const body_html = body_md ? await markdownToHtml(body_md) : "";

  const row = {
    slug,
    title,
    date_start: optDate(p, "date_start"),
    date_end: optDate(p, "date_end"),
    date_precision: optStr(p, "date_precision"),
    era_id: optStr(p, "era_id"),
    body_md,
    body_html,
    source: "captured",
    status: optStr(p, "status") || "draft",
    display_order: typeof p.display_order === "number" ? p.display_order : null,
  };

  const { data, error } = await supabase.from("life_events").upsert(row, { onConflict: "slug" }).select().single();
  if (error) throw new Error(error.message);

  const stale = await resolveAndMarkStale(supabase, {
    entity_kind: "life_event",
    entity_id: data.id,
    entity_slug: data.slug,
    entity_title: data.title,
    action: (p.action as StaleAction) ?? "added",
    date: data.date_start,
    date_start: data.date_start,
    date_end: data.date_end,
    era_id: data.era_id,
  });

  return ok(data, stale);
}

// ---------- Era ----------

async function captureEra(supabase: Sb, p: Record<string, unknown>) {
  const title = reqStr(p, "title");
  const slug = optStr(p, "slug") || slugify(title);
  const kind = reqStr(p, "kind");
  if (!["life", "release"].includes(kind)) throw new Error("kind must be 'life' or 'release'");
  const date_start = optDate(p, "date_start");
  if (!date_start) throw new Error("date_start required");
  const body_md = optStr(p, "body_md") || "";

  const row = {
    slug,
    title,
    kind,
    date_start,
    date_end: optDate(p, "date_end"),
    release_id: optStr(p, "release_id"),
    body_md,
    body_html: body_md ? await markdownToHtml(body_md) : "",
    display_order: typeof p.display_order === "number" ? p.display_order : 0,
    status: optStr(p, "status") || "draft",
  };

  const { data, error } = await supabase.from("eras").upsert(row, { onConflict: "slug" }).select().single();
  if (error) throw new Error(error.message);

  const stale = await resolveAndMarkStale(supabase, {
    entity_kind: "era",
    entity_id: data.id,
    entity_slug: data.slug,
    entity_title: data.title,
    action: (p.action as StaleAction) ?? "added",
    date_start: data.date_start,
    date_end: data.date_end,
    era_id: data.id,
  });

  return ok(data, stale);
}

// ---------- Song state change ----------

async function captureSongStateChange(supabase: Sb, p: Record<string, unknown>) {
  const song_id = reqStr(p, "song_id");
  const new_state = reqStr(p, "new_state");
  const note = optStr(p, "note");

  const { data: song, error: getErr } = await supabase
    .from("songs")
    .select("id,song_state,release_date,write_date,title,slug")
    .eq("id", song_id)
    .single();
  if (getErr || !song) throw new Error(getErr?.message ?? "song not found");

  const prev_state = song.song_state ?? null;

  const { error: updErr } = await supabase
    .from("songs")
    .update({ song_state: new_state })
    .eq("id", song_id);
  if (updErr) throw new Error(updErr.message);

  await supabase.from("song_state_history").insert({
    song_id,
    prev_state,
    new_state,
    source: "capture",
    note,
  });

  // Sections in scope: any date-range section containing the song's release_date
  // or write_date. Era link is implicit (no song_eras junction in v1) so we
  // skip era-scope matching here.
  const stale = await resolveAndMarkStale(supabase, {
    entity_kind: "song_state_change",
    entity_id: song_id,
    entity_slug: song.slug,
    entity_title: song.title,
    action: "updated",
    date: song.release_date ?? song.write_date ?? null,
  });

  return ok({ song_id, prev_state, new_state }, stale);
}

// ---------- Relationship ----------

async function captureRelationship(supabase: Sb, p: Record<string, unknown>) {
  const full_name = reqStr(p, "full_name");
  const slug = optStr(p, "slug") || slugify(full_name);
  const body_md = optStr(p, "body_md") || "";

  const row = {
    slug,
    full_name,
    role: optStr(p, "role"),
    first_contact_date: optDate(p, "first_contact_date"),
    last_contact_date: optDate(p, "last_contact_date"),
    still_active: typeof p.still_active === "boolean" ? p.still_active : true,
    body_md,
    body_html: body_md ? await markdownToHtml(body_md) : "",
    status: optStr(p, "status") || "draft",
  };

  const { data, error } = await supabase.from("relationships").upsert(row, { onConflict: "slug" }).select().single();
  if (error) throw new Error(error.message);

  // Optional junction inserts
  if (Array.isArray(p.song_ids)) {
    const rows = (p.song_ids as string[]).map((sid) => ({ song_id: sid, relationship_id: data.id }));
    if (rows.length) await supabase.from("song_relationships").upsert(rows, { onConflict: "song_id,relationship_id" });
  }
  if (Array.isArray(p.life_event_ids)) {
    const rows = (p.life_event_ids as string[]).map((lid) => ({ life_event_id: lid, relationship_id: data.id }));
    if (rows.length) await supabase.from("life_event_relationships").upsert(rows, { onConflict: "life_event_id,relationship_id" });
  }

  const stale = await resolveAndMarkStale(supabase, {
    entity_kind: "relationship",
    entity_id: data.id,
    entity_slug: data.slug,
    entity_title: data.full_name,
    action: (p.action as StaleAction) ?? "added",
    date_start: data.first_contact_date,
    date_end: data.last_contact_date,
  });

  return ok(data, stale);
}

// ---------- Geography band ----------

async function captureGeographyBand(supabase: Sb, p: Record<string, unknown>) {
  const location_name = reqStr(p, "location_name");
  const slug = optStr(p, "slug") || slugify(location_name);
  const date_start = optDate(p, "date_start");
  if (!date_start) throw new Error("date_start required");
  const body_md = optStr(p, "body_md") || "";

  const row = {
    slug,
    location_name,
    region: optStr(p, "region"),
    date_start,
    date_end: optDate(p, "date_end"),
    body_md,
    body_html: body_md ? await markdownToHtml(body_md) : "",
    status: optStr(p, "status") || "draft",
  };

  const { data, error } = await supabase.from("geography_bands").upsert(row, { onConflict: "slug" }).select().single();
  if (error) throw new Error(error.message);

  const stale = await resolveAndMarkStale(supabase, {
    entity_kind: "geography_band",
    entity_id: data.id,
    entity_slug: data.slug,
    entity_title: data.location_name,
    action: (p.action as StaleAction) ?? "added",
    date_start: data.date_start,
    date_end: data.date_end,
  });

  return ok(data, stale);
}

// ---------- Thematic thread ----------

async function captureThematicThread(supabase: Sb, p: Record<string, unknown>) {
  const name = reqStr(p, "name");
  const slug = optStr(p, "slug") || slugify(name);
  const description_md = optStr(p, "description_md") || "";

  const row = {
    slug,
    name,
    description_md,
    description_html: description_md ? await markdownToHtml(description_md) : "",
    status: optStr(p, "status") || "draft",
  };

  const { data, error } = await supabase.from("thematic_threads").upsert(row, { onConflict: "slug" }).select().single();
  if (error) throw new Error(error.message);

  // Optional polymorphic links
  if (Array.isArray(p.links)) {
    const rows = (p.links as Array<{ entity_kind: string; entity_id: string }>).map((l) => ({
      thread_id: data.id,
      entity_kind: l.entity_kind,
      entity_id: l.entity_id,
    }));
    if (rows.length) await supabase.from("thematic_thread_links").upsert(rows, { onConflict: "thread_id,entity_kind,entity_id" });
  }

  const stale = await resolveAndMarkStale(supabase, {
    entity_kind: "thematic_thread",
    entity_id: data.id,
    entity_slug: data.slug,
    entity_title: data.name,
    action: (p.action as StaleAction) ?? "added",
    thematic_thread_ids: [data.id],
  });

  return ok(data, stale);
}

// ---------- Industry encounter ----------

async function captureIndustryEncounter(supabase: Sb, p: Record<string, unknown>) {
  const title = reqStr(p, "title");
  const slug = optStr(p, "slug") || slugify(title);
  const body_md = optStr(p, "body_md") || "";

  const row = {
    slug,
    title,
    date: optDate(p, "date"),
    counterparty: optStr(p, "counterparty"),
    outcome: optStr(p, "outcome"),
    body_md,
    body_html: body_md ? await markdownToHtml(body_md) : "",
    status: optStr(p, "status") || "draft",
  };

  const { data, error } = await supabase.from("industry_encounters").upsert(row, { onConflict: "slug" }).select().single();
  if (error) throw new Error(error.message);

  const stale = await resolveAndMarkStale(supabase, {
    entity_kind: "industry_encounter",
    entity_id: data.id,
    entity_slug: data.slug,
    entity_title: data.title,
    action: (p.action as StaleAction) ?? "added",
    date: data.date,
  });

  return ok(data, stale);
}

// ---------- Art piece date update ----------

async function captureArtPieceDate(supabase: Sb, p: Record<string, unknown>) {
  const art_piece_id = reqStr(p, "art_piece_id");
  const created_at_date = optDate(p, "created_at_date");

  const { data: existing, error: getErr } = await supabase
    .from("art_pieces")
    .select("id,title,slug")
    .eq("id", art_piece_id)
    .single();
  if (getErr || !existing) throw new Error(getErr?.message ?? "art piece not found");

  const { error } = await supabase
    .from("art_pieces")
    .update({ created_at_date })
    .eq("id", art_piece_id);
  if (error) throw new Error(error.message);

  const stale = await resolveAndMarkStale(supabase, {
    entity_kind: "art_piece",
    entity_id: art_piece_id,
    entity_slug: existing.slug,
    entity_title: existing.title,
    action: "updated",
    date: created_at_date,
  });

  return ok({ art_piece_id, created_at_date }, stale);
}

// ---------- Prose section scope update ----------

async function captureProseSectionScope(supabase: Sb, p: Record<string, unknown>) {
  const section_id = reqStr(p, "section_id");
  const updates: Record<string, unknown> = {};
  if (typeof p.scope_kind === "string") updates.scope_kind = p.scope_kind;
  if (typeof p.era_id === "string" || p.era_id === null) updates.era_id = p.era_id;
  if (typeof p.date_start === "string" || p.date_start === null) updates.date_start = p.date_start;
  if (typeof p.date_end === "string" || p.date_end === null) updates.date_end = p.date_end;
  if (Array.isArray(p.thematic_thread_ids)) updates.thematic_thread_ids = p.thematic_thread_ids;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "no scope updates provided" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("prose_sections")
    .update(updates)
    .eq("id", section_id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Scope changes don't trigger stale (the section IS the prose; it's a scope edit, not a node-in-scope edit).
  return ok(data, []);
}
