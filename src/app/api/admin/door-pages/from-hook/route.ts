import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/utils";
import { isReservedSlug } from "@/lib/reserved-slugs";

export async function POST(request: Request) {
  const { hook, song_ids } = (await request.json()) as {
    hook: string;
    song_ids: string[];
  };

  if (!hook || typeof hook !== "string" || !hook.trim()) {
    return Response.json({ error: "hook is required" }, { status: 400 });
  }
  const cleanHook = hook.trim();
  const title = cleanHook.replace(/^./, (c) => c.toUpperCase());

  let slug = slugify(cleanHook);
  if (isReservedSlug(slug)) slug = `${slug}-door`;

  const supabase = createAdminClient();

  // Disambiguate slug collisions
  const { data: existingSlug } = await supabase
    .from("door_pages")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existingSlug) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const { data: door, error } = await supabase
    .from("door_pages")
    .insert({
      title,
      slug,
      body: "",
      target_queries: [cleanHook],
      funnel_targets: [],
      status: "draft",
    })
    .select()
    .single();
  if (error || !door) {
    return Response.json({ error: error?.message || "insert failed" }, { status: 500 });
  }

  if (Array.isArray(song_ids) && song_ids.length > 0) {
    const rows = song_ids.map((song_id, position) => ({
      door_page_id: door.id,
      song_id,
      position,
    }));
    await supabase.from("door_page_songs").insert(rows);
  }

  return Response.json({ id: door.id, slug: door.slug }, { status: 201 });
}
