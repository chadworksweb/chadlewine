import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RELEASE_TYPES = new Set(["album", "song"]);
const MEDIA_TYPES = new Set(["image", "video"]);

interface FaceInput {
  slot: number;
  media_type: "image" | "video";
  media_path: string;
  focal_x?: number | null;
  focal_y?: number | null;
  zoom?: number | null;
}

async function resolveReleaseId(
  supabase: ReturnType<typeof createAdminClient>,
  releaseType: string,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const table = releaseType === "album" ? "albums" : "songs";
  const { data } = await supabase.from(table).select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const releaseType = url.searchParams.get("type");
  const idOrSlug = url.searchParams.get("id");
  if (!releaseType || !RELEASE_TYPES.has(releaseType) || !idOrSlug) {
    return Response.json({ error: "type and id required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const releaseId = await resolveReleaseId(supabase, releaseType, idOrSlug);
  if (!releaseId) return Response.json({ error: "release not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("release_cube_faces")
    .select("slot, media_type, media_path, focal_x, focal_y, zoom")
    .eq("release_type", releaseType)
    .eq("release_id", releaseId)
    .order("slot");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ release_id: releaseId, faces: data ?? [] });
}

export async function PUT(req: Request) {
  const url = new URL(req.url);
  const releaseType = url.searchParams.get("type");
  const idOrSlug = url.searchParams.get("id");
  if (!releaseType || !RELEASE_TYPES.has(releaseType) || !idOrSlug) {
    return Response.json({ error: "type and id required" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.faces)) {
    return Response.json({ error: "faces array required" }, { status: 400 });
  }

  const cleaned: FaceInput[] = [];
  for (const raw of body.faces as unknown[]) {
    const f = raw as Partial<FaceInput>;
    const slot = Number(f.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > 5) continue;
    if (!f.media_type || !MEDIA_TYPES.has(f.media_type)) continue;
    if (typeof f.media_path !== "string" || !f.media_path.trim()) continue;
    cleaned.push({
      slot,
      media_type: f.media_type,
      media_path: f.media_path.trim(),
      focal_x: f.focal_x ?? null,
      focal_y: f.focal_y ?? null,
      zoom: f.zoom ?? 1,
    });
  }

  const supabase = createAdminClient();
  const releaseId = await resolveReleaseId(supabase, releaseType, idOrSlug);
  if (!releaseId) return Response.json({ error: "release not found" }, { status: 404 });

  // Replace-all semantics: delete then insert. Five rows max, so the cost is
  // negligible and the caller doesn't need to track which rows existed before.
  const { error: delErr } = await supabase
    .from("release_cube_faces")
    .delete()
    .eq("release_type", releaseType)
    .eq("release_id", releaseId);
  if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

  if (cleaned.length === 0) {
    return Response.json({ release_id: releaseId, faces: [] });
  }

  const rows = cleaned.map((f) => ({
    release_type: releaseType,
    release_id: releaseId,
    ...f,
  }));
  const { data, error } = await supabase
    .from("release_cube_faces")
    .insert(rows)
    .select("slot, media_type, media_path, focal_x, focal_y, zoom")
    .order("slot");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ release_id: releaseId, faces: data ?? [] });
}
