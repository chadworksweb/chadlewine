import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/utils";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("merch_types")
    .select("id, slug, label, sort_order, created_at")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Counts: merch rows per type, plus the implicit physical_music bucket
  // (distinct released releases that have a sellable vinyl/cd/cassette SKU --
  // same shape as the public /merch storefront groups).
  const types = data || [];
  const ids = types.filter((t) => t.slug !== "physical_music").map((t) => t.id);

  const countByType = new Map<string, number>();
  if (ids.length > 0) {
    const { data: merchRows } = await supabase
      .from("merch")
      .select("merch_type_id")
      .in("merch_type_id", ids);
    for (const r of (merchRows || []) as { merch_type_id: string | null }[]) {
      if (!r.merch_type_id) continue;
      countByType.set(r.merch_type_id, (countByType.get(r.merch_type_id) || 0) + 1);
    }
  }

  const physicalMusic = types.find((t) => t.slug === "physical_music");
  if (physicalMusic) {
    const { data: skuRows } = await supabase
      .from("release_skus")
      .select("release_id, release:releases!inner(status)")
      .in("format", ["vinyl", "cd", "cassette"])
      .in("status", ["available", "preorder", "sold_out"]);
    const releaseIds = new Set<string>();
    type Row = { release_id: string; release: { status: string } | null };
    for (const r of ((skuRows as unknown) as Row[] | null) || []) {
      if (r.release?.status === "published") releaseIds.add(r.release_id);
    }
    countByType.set(physicalMusic.id, releaseIds.size);
  }

  const withCounts = types.map((t) => ({ ...t, item_count: countByType.get(t.id) || 0 }));
  return Response.json(withCounts);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  const label = (body.label as string | undefined)?.trim();
  if (!label) {
    return Response.json({ error: "label is required" }, { status: 400 });
  }

  const slug = (body.slug as string | undefined)?.trim() || slugify(label).replace(/-/g, "_");

  const { data, error } = await supabase
    .from("merch_types")
    .insert({
      label,
      slug,
      sort_order: typeof body.sort_order === "number" ? body.sort_order : 100,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
