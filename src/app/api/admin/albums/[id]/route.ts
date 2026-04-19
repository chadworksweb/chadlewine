import { createAdminClient } from "@/lib/supabase-server";
import { captureSlugChange } from "@/lib/redirects";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("albums").select("*").eq("id", id).single();
  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();
  const fields = ["title", "slug", "release_date", "cover_art_path", "cover_art_alt", "description", "display_order", "status", "format_id", "price", "download_path_mp3", "download_path_flac", "download_path_wav"];
  const updates: Record<string, unknown> = {};
  for (const f of fields) { if (f in body) updates[f] = body[f]; }

  const { data: prev } = await supabase.from("albums").select("slug").eq("id", id).single();

  const { data, error } = await supabase.from("albums").update(updates).eq("id", id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (typeof updates.slug === "string" && prev?.slug && prev.slug !== updates.slug) {
    const oldSlug = prev.slug as string;
    const newSlug = updates.slug;
    await captureSlugChange(`/music/albums/${oldSlug}`, `/music/albums/${newSlug}`, "album", id);

    // Mirror lyrics URLs for every track on the album
    const { data: tracks } = await supabase
      .from("album_songs")
      .select("song:songs(slug)")
      .eq("album_id", id);
    for (const t of (tracks || []) as Array<{ song?: { slug?: string } }>) {
      const songSlug = t.song?.slug;
      if (songSlug) {
        await captureSlugChange(
          `/lyrics/${oldSlug}/${songSlug}`,
          `/lyrics/${newSlug}/${songSlug}`,
          "lyrics",
          id
        );
      }
    }
  }

  return Response.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("albums").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
