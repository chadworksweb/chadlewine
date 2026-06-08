import { createPublicClient } from "@/lib/supabase-server";

// Observation and journal posts live in the SAME `posts` table, discriminated
// by the `kind` column ('observation' | 'journal'). They share every field,
// taxonomy table, revision, and SEO trigger -- only the subject matter (and the
// public section they surface under) differs. These fetchers are parametrized
// by kind so /writings/observations and /writings/journal reuse identical logic,
// and every query filters by kind so cross-links stay WITHIN a section.
export type EntryKind = "observation" | "journal";

export async function getEntriesArchive(kind: EntryKind) {
  const supabase = createPublicClient();

  const { data } = await supabase
    .from("posts")
    .select("id, title, slug, date_captured, art_image_path, art_alt, hook_line, status")
    .eq("status", "published")
    .eq("kind", kind)
    .order("date_captured", { ascending: false });

  return data || [];
}

export async function getEntry(kind: EntryKind, slug: string) {
  const supabase = createPublicClient();

  const { data: observation } = await supabase
    .from("posts")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .eq("kind", kind)
    .single();

  if (!observation) return null;

  const { data: thoughtlineLinks } = await supabase
    .from("post_thoughtlines")
    .select("thoughtline_id")
    .eq("post_id", observation.id);

  const { data: categoryLinks } = await supabase
    .from("post_categories")
    .select("category_id, categories(title, slug)")
    .eq("post_id", observation.id);

  const { data: tagLinks } = await supabase
    .from("post_tags")
    .select("tag_id, tags(label, slug)")
    .eq("post_id", observation.id);

  return {
    ...observation,
    thoughtline_ids: thoughtlineLinks?.map((t) => t.thoughtline_id) || [],
    category_ids: categoryLinks?.map((c) => c.category_id) || [],
    tag_ids: tagLinks?.map((t) => t.tag_id) || [],
    categories: categoryLinks?.map((c) => (c as Record<string, unknown>).categories as { title: string; slug: string }) || [],
    tags: tagLinks?.map((t) => (t as Record<string, unknown>).tags as { label: string; slug: string }) || [],
  };
}

export async function getAdjacentEntries(
  kind: EntryKind,
  dateCaptured: string,
  entryId: string,
) {
  const supabase = createPublicClient();

  const { data: newer } = await supabase
    .from("posts")
    .select("title, slug")
    .eq("status", "published")
    .eq("kind", kind)
    .gt("date_captured", dateCaptured)
    .neq("id", entryId)
    .order("date_captured", { ascending: true })
    .limit(1)
    .single();

  const { data: older } = await supabase
    .from("posts")
    .select("title, slug")
    .eq("status", "published")
    .eq("kind", kind)
    .lt("date_captured", dateCaptured)
    .neq("id", entryId)
    .order("date_captured", { ascending: false })
    .limit(1)
    .single();

  return { newer, older };
}

// Synapse Jumper: related by shared thoughtlines (within the same kind).
export async function getSynapseEntries(
  kind: EntryKind,
  entryId: string,
  thoughtlineIds: string[],
) {
  if (thoughtlineIds.length === 0) return [];
  const supabase = createPublicClient();
  const { data: links } = await supabase
    .from("post_thoughtlines")
    .select("post_id")
    .in("thoughtline_id", thoughtlineIds)
    .neq("post_id", entryId);
  if (!links || links.length === 0) return [];
  const ids = [...new Set(links.map((l) => l.post_id))];
  const { data } = await supabase
    .from("posts")
    .select("id, title, slug, art_image_path, art_alt")
    .eq("status", "published")
    .eq("kind", kind)
    .in("id", ids)
    .order("date_captured", { ascending: false })
    .limit(3);
  return data || [];
}

// Related entries: random by shared categories + tags (within the same kind).
export async function getRelatedEntries(
  kind: EntryKind,
  entryId: string,
  categoryIds: string[],
  tagIds: string[],
  excludeIds: string[],
) {
  if (categoryIds.length === 0 && tagIds.length === 0) return [];
  const supabase = createPublicClient();
  const candidateIds = new Set<string>();

  if (categoryIds.length > 0) {
    const { data: catLinks } = await supabase
      .from("post_categories")
      .select("post_id")
      .in("category_id", categoryIds)
      .neq("post_id", entryId);
    catLinks?.forEach((l) => candidateIds.add(l.post_id));
  }

  if (tagIds.length > 0) {
    const { data: tagLinks } = await supabase
      .from("post_tags")
      .select("post_id")
      .in("tag_id", tagIds)
      .neq("post_id", entryId);
    tagLinks?.forEach((l) => candidateIds.add(l.post_id));
  }

  // Remove any already shown in Synapse Jumper
  excludeIds.forEach((id) => candidateIds.delete(id));

  if (candidateIds.size === 0) return [];

  const ids = [...candidateIds];
  const { data } = await supabase
    .from("posts")
    .select("id, title, slug, art_image_path, art_alt")
    .eq("status", "published")
    .eq("kind", kind)
    .in("id", ids);

  if (!data || data.length === 0) return [];

  // Shuffle and take 8 (4 cols x 2 rows)
  const shuffled = data.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 8);
}

// Prerender slugs for a kind's detail route.
export async function getEntrySlugs(kind: EntryKind) {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("posts")
    .select("slug")
    .eq("status", "published")
    .eq("kind", kind)
    .not("slug", "is", null);
  return (data || []).map((o) => o.slug as string);
}
