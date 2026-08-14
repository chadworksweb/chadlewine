import { createAdminClient } from "@/lib/supabase-server";
import { ENTITY_TYPES, entityExists, resolveEntities, type EntityType } from "@/lib/related-entities";

function valid(t: unknown): t is EntityType {
  return typeof t === "string" && (ENTITY_TYPES as readonly string[]).includes(t);
}

// GET ?source_type=&source_id=  -> ordered rows, enriched with title/image/href
// (admin mode: includes draft/inactive targets so picked items stay visible).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source_type = searchParams.get("source_type");
  const source_id = searchParams.get("source_id");
  if (!source_type || !source_id) {
    return Response.json({ error: "source_type and source_id required" }, { status: 400 });
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("related_entities")
    .select("id, entity_type, entity_id, display_order")
    .eq("source_type", source_type)
    .eq("source_id", source_id)
    .order("display_order");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data || []) as { id: string; entity_type: EntityType; entity_id: string; display_order: number }[];
  const resolved = await resolveEntities(
    supabase,
    rows.map((r) => ({ entity_type: r.entity_type, entity_id: r.entity_id })),
    { includeUnpublished: true },
  );
  const byKey = new Map(resolved.map((r) => [`${r.entity_type}:${r.id}`, r]));
  const out = rows.map((r) => {
    const d = byKey.get(`${r.entity_type}:${r.entity_id}`);
    return {
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      title: d?.title ?? "(missing)",
      image: d?.image ?? null,
    };
  });
  return Response.json(out);
}

// POST { source_type, source_id, entity_type, entity_id } -> append.
export async function POST(request: Request) {
  const body = await request.json();
  const { source_type, source_id, entity_type, entity_id } = body;
  if (!valid(source_type) || !valid(entity_type) || !source_id || !entity_id) {
    return Response.json({ error: "valid source_type, source_id, entity_type, entity_id required" }, { status: 400 });
  }
  const supabase = createAdminClient();

  // The id has to exist in the table entity_type points at. A mismatched pair
  // (a release id filed under 'song', say) would otherwise save fine and then
  // render as "(missing)" on every load.
  if (!(await entityExists(supabase, entity_type, entity_id))) {
    return Response.json(
      { error: `No ${entity_type} found with that id` },
      { status: 400 },
    );
  }

  // Append after the current last row. Counting rows gave two fast adds the
  // same display_order.
  const { data: lastRow } = await supabase
    .from("related_entities")
    .select("display_order")
    .eq("source_type", source_type)
    .eq("source_id", source_id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((lastRow?.display_order as number | undefined) ?? -1) + 1;

  const { data, error } = await supabase
    .from("related_entities")
    .insert({ source_type, source_id, entity_type, entity_id, display_order: nextOrder })
    .select("id, entity_type, entity_id, display_order")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}

// PUT { ids: [rowId, ...] } -> set display_order to array index (reorder).
export async function PUT(request: Request) {
  const body = await request.json();
  const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
  const supabase = createAdminClient();
  await Promise.all(
    ids.map((id, i) =>
      supabase.from("related_entities").update({ display_order: i }).eq("id", id),
    ),
  );
  return Response.json({ ok: true });
}

// DELETE ?id=
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from("related_entities").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
