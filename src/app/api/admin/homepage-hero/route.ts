import { createAdminClient } from "@/lib/supabase-server";

const ENTITY_TYPES = ["song", "album", "merch", "observation", "art"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

const TABLE_BY_TYPE: Record<EntityType, string> = {
  song: "songs",
  album: "albums",
  merch: "products",
  observation: "observations",
  art: "art_pieces",
};

export async function GET() {
  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from("homepage_hero")
    .select("id, entity_type, entity_id, display_order, created_at")
    .order("display_order", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Hydrate each row with the entity's title + slug for display in the admin
  // table. Group ids by type, batch-fetch, then merge.
  const byType: Record<EntityType, string[]> = { song: [], album: [], merch: [], observation: [], art: [] };
  for (const r of rows || []) {
    if ((ENTITY_TYPES as readonly string[]).includes(r.entity_type)) {
      byType[r.entity_type as EntityType].push(r.entity_id);
    }
  }

  const fetches = (Object.entries(byType) as [EntityType, string[]][]).map(async ([type, ids]) => {
    if (ids.length === 0) return [type, new Map<string, { title: string; slug: string | null }>()] as const;
    const { data } = await supabase.from(TABLE_BY_TYPE[type]).select("id, title, slug").in("id", ids);
    const map = new Map<string, { title: string; slug: string | null }>();
    for (const r of (data || []) as Array<{ id: string; title: string; slug: string | null }>) {
      map.set(r.id, { title: r.title, slug: r.slug });
    }
    return [type, map] as const;
  });

  const resolved = await Promise.all(fetches);
  const lookups = Object.fromEntries(resolved) as Record<EntityType, Map<string, { title: string; slug: string | null }>>;

  const hydrated = (rows || []).map((r) => {
    const t = r.entity_type as EntityType;
    const meta = lookups[t]?.get(r.entity_id);
    return {
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      display_order: r.display_order,
      title: meta?.title ?? "(missing)",
      slug: meta?.slug ?? null,
    };
  });

  return Response.json(hydrated);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  const entityType = typeof body.entity_type === "string" ? body.entity_type : null;
  const entityId = typeof body.entity_id === "string" ? body.entity_id : null;

  if (!entityType || !(ENTITY_TYPES as readonly string[]).includes(entityType)) {
    return Response.json({ error: "invalid entity_type" }, { status: 400 });
  }
  if (!entityId) {
    return Response.json({ error: "entity_id required" }, { status: 400 });
  }

  // Place new entry at the end of the order.
  const { data: maxRow } = await supabase
    .from("homepage_hero")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.display_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("homepage_hero")
    .insert({ entity_type: entityType, entity_id: entityId, display_order: nextOrder })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
