import { createAdminClient } from "@/lib/supabase-server";
import { getMediaConfig } from "@/lib/media-config";
import { deleteFromBunny } from "@/lib/bunny";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SOFT_DELETE_GRACE_DAYS = 30;

interface AdminClient extends ReturnType<typeof createAdminClient> {}

interface SoftDeletedRow {
  id: string;
  url: string;
  source: string;
  deleted_at: string;
}

// Extract the path inside the site-image zone from a pull-zone URL. Returns
// null for anything that doesn't look like a site-image URL (e.g. a Printify
// CDN URL on a soft-deleted printify row, which we don't manage).
function extractZonePath(url: string, pullZoneBase: string): string | null {
  const base = pullZoneBase.replace(/\/+$/, "");
  if (!url.startsWith(base)) return null;
  const rest = url.slice(base.length).replace(/^\/+/, "");
  return rest || null;
}

async function sweepSoftDeleted(supabase: AdminClient): Promise<{
  hardDeleted: number;
  errors: number;
}> {
  const config = getMediaConfig("site-image");
  const cutoff = new Date(
    Date.now() - SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: rows, error } = await supabase
    .from("product_images")
    .select("id, url, source, deleted_at")
    .eq("source", "custom")
    .lt("deleted_at", cutoff)
    .not("deleted_at", "is", null);
  if (error) throw error;

  let hardDeleted = 0;
  let errors = 0;
  for (const row of (rows || []) as SoftDeletedRow[]) {
    const bunnyPath = extractZonePath(row.url, config.pullZoneUrl);
    if (bunnyPath) {
      try {
        await deleteFromBunny(config, bunnyPath);
      } catch (err) {
        console.error(`[merch-cleanup] bunny delete failed: ${row.id} ${(err as Error).message}`);
        errors++;
        continue;
      }
    }
    const { error: delErr } = await supabase
      .from("product_images")
      .delete()
      .eq("id", row.id);
    if (delErr) {
      console.error(`[merch-cleanup] db delete failed: ${row.id} ${delErr.message}`);
      errors++;
      continue;
    }
    hardDeleted++;
  }
  return { hardDeleted, errors };
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${expected}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createAdminClient();

  try {
    const soft = await sweepSoftDeleted(supabase);
    return Response.json({
      ok: true,
      soft_deleted_hard_purged: soft.hardDeleted,
      errors: soft.errors,
    });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
