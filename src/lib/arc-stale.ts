import type { SupabaseClient } from "@supabase/supabase-js";

export type StaleAction = "added" | "updated" | "removed" | "linked" | "unlinked";

export type CaptureContext = {
  entity_kind: string;
  entity_id: string;
  entity_slug?: string;
  entity_title?: string;
  action: StaleAction;
  // Date(s) used for date-range scope matching. If omitted, scope match is era/thematic only.
  date?: string | null;
  date_start?: string | null;
  date_end?: string | null;
  // Era linkage. If a node is linked to an era, sections with scope_kind='era' on that era match.
  era_id?: string | null;
  // Thematic links. Array of thread IDs the entity is tagged with.
  thematic_thread_ids?: string[];
};

type ProseSectionRow = {
  id: string;
  slug: string;
  scope_kind: "era" | "date-range" | "thematic";
  era_id: string | null;
  date_start: string | null;
  date_end: string | null;
  thematic_thread_ids: string[] | null;
  stale_reasons: unknown;
};

/**
 * Resolves which prose_sections are affected by a capture/update event,
 * marks them stale, appends stale_reasons, and upserts dependency rows.
 * Returns the affected section ids.
 *
 * Scope matching (OR logic):
 *   - date-range: any of {date, date_start, date_end} falls inside section window
 *   - era: section.era_id matches ctx.era_id
 *   - thematic: any of ctx.thematic_thread_ids appears in section.thematic_thread_ids
 */
export async function resolveAndMarkStale(
  supabase: SupabaseClient,
  ctx: CaptureContext
): Promise<string[]> {
  const { data: sections, error } = await supabase
    .from("prose_sections")
    .select("id,slug,scope_kind,era_id,date_start,date_end,thematic_thread_ids,stale_reasons");

  if (error || !sections) return [];

  const affected = (sections as ProseSectionRow[]).filter((s) => inScope(s, ctx));
  if (affected.length === 0) return [];

  const now = new Date().toISOString();
  const reason = {
    kind: ctx.entity_kind,
    entity_id: ctx.entity_id,
    entity_slug: ctx.entity_slug ?? null,
    entity_title: ctx.entity_title ?? null,
    action: ctx.action,
    at: now,
  };

  // Update each affected section: set is_stale=true and append a reason.
  // Done one-at-a-time because we're mutating jsonb (no batch upsert without
  // overwriting the whole array).
  await Promise.all(
    affected.map(async (s) => {
      const existing = Array.isArray(s.stale_reasons) ? (s.stale_reasons as unknown[]) : [];
      const next = [reason, ...existing].slice(0, 200); // soft cap to avoid runaway growth
      await supabase
        .from("prose_sections")
        .update({ is_stale: true, stale_reasons: next })
        .eq("id", s.id);
    })
  );

  // Upsert polymorphic dependency rows so Section Manager can list "what
  // entities are in this section's scope". Conflict on the unique triple.
  const depRows = affected.map((s) => ({
    section_id: s.id,
    entity_kind: ctx.entity_kind,
    entity_id: ctx.entity_id,
  }));
  if (depRows.length > 0) {
    await supabase
      .from("prose_section_dependencies")
      .upsert(depRows, { onConflict: "section_id,entity_kind,entity_id" });
  }

  return affected.map((s) => s.id);
}

function inScope(section: ProseSectionRow, ctx: CaptureContext): boolean {
  if (section.scope_kind === "era") {
    return !!ctx.era_id && ctx.era_id === section.era_id;
  }
  if (section.scope_kind === "thematic") {
    if (!ctx.thematic_thread_ids || ctx.thematic_thread_ids.length === 0) return false;
    const ids = section.thematic_thread_ids ?? [];
    return ctx.thematic_thread_ids.some((id) => ids.includes(id));
  }
  if (section.scope_kind === "date-range") {
    const dates: string[] = [];
    if (ctx.date) dates.push(ctx.date);
    if (ctx.date_start) dates.push(ctx.date_start);
    if (ctx.date_end) dates.push(ctx.date_end);
    if (dates.length === 0) return false;
    const start = section.date_start;
    const end = section.date_end;
    return dates.some((d) => withinRange(d, start, end));
  }
  return false;
}

function withinRange(d: string, start: string | null, end: string | null): boolean {
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}
