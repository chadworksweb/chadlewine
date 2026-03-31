import { createPublicClient } from "@/lib/supabase-server";
import { createMusicCheckoutSession } from "@/lib/stripe";

export async function POST(request: Request) {
  const body = await request.json();
  const { type, id } = body as { type: "song" | "album"; id: string };

  if (!type || !id || !["song", "album"].includes(type)) {
    return Response.json({ error: "type (song|album) and id required" }, { status: 400 });
  }

  const supabase = createPublicClient();
  const origin = request.headers.get("origin") || "https://chadlewine.com";

  if (type === "song") {
    const { data: song } = await supabase.from("songs").select("id, title, slug, price").eq("id", id).single();
    if (!song) return Response.json({ error: "Song not found" }, { status: 404 });
    if (!song.price) return Response.json({ error: "Song has no price set" }, { status: 400 });

    const { data: assoc } = await supabase
      .from("album_songs")
      .select("album:albums(title, slug, cover_art_path)")
      .eq("song_id", id)
      .single();

    const album = (assoc as any)?.album;

    const session = await createMusicCheckoutSession({
      type: "song",
      item_id: song.id,
      title: song.title,
      album_title: album?.title,
      price: song.price,
      cover_art_url: album?.cover_art_path || undefined,
      success_url: `${origin}/music/purchase/digital-download-thank-you?type=song&id=${song.id}`,
      cancel_url: `${origin}/music/songs/${song.slug}`,
    });

    if (!session.url) return Response.json({ error: "No checkout URL" }, { status: 500 });
    return Response.json({ url: session.url });
  }

  // Album
  const { data: album } = await supabase
    .from("albums")
    .select("id, title, slug, cover_art_path, price")
    .eq("id", id)
    .single();
  if (!album) return Response.json({ error: "Album not found" }, { status: 404 });
  if (!album.price) return Response.json({ error: "Album has no price set" }, { status: 400 });

  const session = await createMusicCheckoutSession({
    type: "album",
    item_id: album.id,
    title: album.title,
    price: album.price,
    cover_art_url: album.cover_art_path || undefined,
    success_url: `${origin}/music/purchase/digital-download-thank-you?type=album&id=${album.id}`,
    cancel_url: `${origin}/music/albums/${album.slug}`,
  });

  if (!session.url) return Response.json({ error: "No checkout URL" }, { status: 500 });
  return Response.json({ url: session.url });
}
