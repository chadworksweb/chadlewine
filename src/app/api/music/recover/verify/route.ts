import { createAdminClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return Response.json({ error: "Token required" }, { status: 400 });

  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("recovery_tokens")
    .select("email, expires_at")
    .eq("token", token)
    .single();

  if (!row) return Response.json({ error: "Invalid token" }, { status: 404 });
  if (new Date(row.expires_at) < new Date()) {
    return Response.json({ error: "Token expired" }, { status: 410 });
  }

  const { data: purchases } = await supabase
    .from("purchases")
    .select("id, item_type, item_id, format, amount, created_at")
    .ilike("buyer_email", row.email)
    .in("item_type", ["song", "album"])
    .order("created_at", { ascending: false });

  if (!purchases || purchases.length === 0) {
    return Response.json({ email: row.email, items: [] });
  }

  // Resolve titles
  const songIds = purchases.filter((p) => p.item_type === "song").map((p) => p.item_id);
  const albumIds = purchases.filter((p) => p.item_type === "album").map((p) => p.item_id);

  const [{ data: songs }, { data: albums }] = await Promise.all([
    songIds.length
      ? supabase.from("songs").select("id, title, slug").in("id", songIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; slug: string }> }),
    albumIds.length
      ? supabase.from("albums").select("id, title, slug, cover_art_path").in("id", albumIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; slug: string; cover_art_path: string | null }> }),
  ]);

  const songMap = new Map((songs || []).map((s) => [s.id, s]));
  const albumMap = new Map((albums || []).map((a) => [a.id, a]));

  const items = purchases.map((p) => {
    const base = {
      purchase_id: p.id,
      item_type: p.item_type,
      format: p.format || null,
      amount: p.amount,
      created_at: p.created_at,
      download_url: `/api/download/${p.id}`,
    };
    if (p.item_type === "song") {
      const s = songMap.get(p.item_id);
      return { ...base, title: s?.title || "Song", slug: s?.slug || null, cover_art_path: null };
    }
    const a = albumMap.get(p.item_id);
    return { ...base, title: a?.title || "Album", slug: a?.slug || null, cover_art_path: a?.cover_art_path || null };
  });

  return Response.json({ email: row.email, items });
}
