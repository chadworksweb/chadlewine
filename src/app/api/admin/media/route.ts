import { createAdminClient } from "@/lib/supabase-server";
import { getMediaConfig, type MediaType } from "@/lib/media-config";
import { deleteFromBunny, listBunny } from "@/lib/bunny";
import { signBunnyUrl } from "@/lib/bunny-token";

// Image zones the Media Library manages. Music zones live in the Audio Library.
const IMAGE_ZONES: MediaType[] = ["site-image", "cover-art", "art-fullres"];

export type Pillar =
  | "observations"
  | "songs"
  | "albums"
  | "art"
  | "pages"
  | "merch";

// Normalize a DB-stored image reference to `{hostname}::{path}` so pillar
// matching works across multiple pull zones.
function toFileKey(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (!/\bb-cdn\.net$/i.test(u.hostname)) return null;
    const path = decodeURIComponent(u.pathname.replace(/^\/+/, "").split("?")[0]);
    return `${u.hostname}::${path}`;
  } catch {
    // Raw path, no host — leave hostname empty so only path-only files match.
    return `::${value.replace(/^\/+/, "").split("?")[0]}`;
  }
}

function fileKey(pullHost: string, path: string): string {
  return `${pullHost}::${path}`;
}

async function buildPillarMap(
  supabase: ReturnType<typeof createAdminClient>,
  filenames: string[],
): Promise<Map<string, Set<Pillar>>> {
  const map = new Map<string, Set<Pillar>>();
  for (const f of filenames) map.set(f, new Set());

  const tag = (value: string | null | undefined, pillar: Pillar) => {
    const key = toFileKey(value);
    if (key && map.has(key)) map.get(key)!.add(pillar);
  };

  const sources: Array<{
    table: string;
    col: string;
    pillar: Pillar;
  }> = [
    { table: "observations", col: "art_image_path", pillar: "observations" },
    { table: "songs", col: "art_image_path", pillar: "songs" },
    { table: "albums", col: "cover_art_path", pillar: "albums" },
    { table: "art_pieces", col: "image_path", pillar: "art" },
    { table: "page_meta", col: "og_image_path", pillar: "pages" },
    { table: "products", col: "image_url", pillar: "merch" },
  ];

  for (const { table, col, pillar } of sources) {
    const { data } = await supabase.from(table).select(col);
    for (const row of (data ?? []) as unknown as Array<Record<string, string | null>>) {
      tag(row[col], pillar);
    }
  }

  // Convention: anything under page-heroes/ (on any zone) is page-owned media
  // even if no page_meta row points at it yet.
  for (const k of filenames) {
    const path = k.split("::")[1] ?? k;
    if (path.startsWith("page-heroes/") && map.has(k)) map.get(k)!.add("pages");
    if (path.startsWith("art-thumbnails/") && map.has(k)) map.get(k)!.add("art");
  }

  return map;
}

type ListedFile = {
  zone: MediaType;
  name: string;
  url: string;
  tokenAuth: boolean;
  dateCreated: string;
  /** Bunny's LastChanged. A replaced file keeps its original DateCreated, so
   *  sorting on that buried a re-upload wherever the first version landed. */
  lastChanged: string;
  pullHost: string;
};

async function listZone(zone: MediaType): Promise<ListedFile[]> {
  const config = getMediaConfig(zone);
  const items = await listBunny(config, "", { recursive: true });
  const pullHost = (() => {
    try { return new URL(config.pullZoneUrl).hostname; } catch { return ""; }
  })();
  return items
    .filter((i) => !i.isDirectory)
    .map((f) => ({
      zone,
      name: f.name,
      // For token-auth zones (art-fullres), sign a short-lived URL for the
      // admin preview. Re-signed on every list; safe for admin-only route.
      url: config.tokenAuth ? signBunnyUrl(config, f.name, 900) : f.url,
      tokenAuth: config.tokenAuth,
      dateCreated: f.dateCreated,
      lastChanged: f.lastChanged,
      pullHost,
    }));
}

// GET /api/admin/media — aggregate all chadlewine-* image zones + merged meta + pillars
export async function GET() {
  const supabase = createAdminClient();

  let allFiles: ListedFile[] = [];
  try {
    const perZone = await Promise.all(IMAGE_ZONES.map((z) => listZone(z)));
    allFiles = perZone.flat();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list images";
    return Response.json({ error: message }, { status: 500 });
  }

  const keyOf = (f: ListedFile) => fileKey(f.pullHost, f.name);
  const keys = allFiles.map(keyOf);

  // Fetch the whole (small) media_meta table rather than filtering by an .in()
  // of every filename: with hundreds of files that filter builds a request URL
  // long enough to fail outright ("fetch failed"), which is what silently
  // blanked all alt/title once the library grew. Mapping locally is cheap.
  const [metaResult, pillarMap] = await Promise.all([
    supabase.from("media_meta").select("filename, alt_text, title"),
    buildPillarMap(supabase, keys),
  ]);

  // Log a metadata read failure instead of swallowing it silently (which is how
  // a missing service_role GRANT hid itself -- alt_text/title came back blank
  // with no signal). Don't fail the whole listing; metadata is secondary.
  if (metaResult.error) {
    console.error("media_meta read failed:", metaResult.error.message);
  }

  const metaMap = new Map<string, { alt_text: string; title: string }>();
  metaResult.data?.forEach((m) => metaMap.set(m.filename, m));

  const images = allFiles
    .sort((a, b) => (a.lastChanged < b.lastChanged ? 1 : -1))
    .map((f) => {
      const meta = metaMap.get(f.name);
      return {
        zone: f.zone,
        name: f.name,
        url: f.url,
        tokenAuth: f.tokenAuth,
        alt_text: meta?.alt_text || "",
        title: meta?.title || "",
        pillars: [...(pillarMap.get(keyOf(f)) ?? [])],
      };
    });

  return Response.json(images);
}

// PUT /api/admin/media — upsert alt_text + title for a filename
export async function PUT(request: Request) {
  const supabase = createAdminClient();
  const { filename, alt_text, title } = await request.json();

  if (!filename) {
    return Response.json({ error: "No filename provided" }, { status: 400 });
  }

  const { error } = await supabase
    .from("media_meta")
    .upsert(
      { filename, alt_text: alt_text || "", title: title || "" },
      { onConflict: "filename" }
    );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

// DELETE /api/admin/media — remove file from its zone + its meta row
export async function DELETE(request: Request) {
  const supabase = createAdminClient();
  const { name, zone } = await request.json();

  if (!name) {
    return Response.json({ error: "No filename provided" }, { status: 400 });
  }

  const targetZone: MediaType =
    zone === "cover-art" || zone === "art-fullres" ? zone : "site-image";
  const config = getMediaConfig(targetZone);

  try {
    await deleteFromBunny(config, name);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bunny delete failed";
    return Response.json({ error: message }, { status: 500 });
  }

  await supabase.from("media_meta").delete().eq("filename", name);

  return Response.json({ ok: true });
}
