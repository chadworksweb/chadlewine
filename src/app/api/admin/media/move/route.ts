import { getMediaConfig, isMediaType, STORAGE_HOSTNAME } from "@/lib/media-config";
import { createAdminClient } from "@/lib/supabase-server";

// POST /api/admin/media/move — copy file to new path, delete old.
// Body: { zone, fromPath, toPath }
// If the new path already exists, returns 409.
// Also migrates the media_meta row (if any) to the new filename key.
export async function POST(request: Request) {
  const { zone, fromPath, toPath } = await request.json();

  if (!isMediaType(zone)) {
    return Response.json({ error: "Invalid zone" }, { status: 400 });
  }
  if (typeof fromPath !== "string" || typeof toPath !== "string" || !fromPath || !toPath) {
    return Response.json({ error: "fromPath and toPath required" }, { status: 400 });
  }
  if (fromPath === toPath) {
    return Response.json({ error: "fromPath and toPath are identical" }, { status: 400 });
  }

  const config = getMediaConfig(zone);
  const base = `https://${STORAGE_HOSTNAME}/${config.storageZone}`;
  const authed = { AccessKey: config.storagePassword };

  // Refuse if destination already exists
  const existing = await fetch(`${base}/${toPath}`, { method: "GET", headers: authed });
  if (existing.status === 200) {
    return Response.json(
      { error: `Destination "${toPath}" already exists in ${config.storageZone}.` },
      { status: 409 },
    );
  }

  const src = await fetch(`${base}/${fromPath}`, { method: "GET", headers: authed });
  if (!src.ok) {
    return Response.json({ error: `Source not found: ${fromPath}` }, { status: 404 });
  }
  const buf = Buffer.from(await src.arrayBuffer());
  const contentType = src.headers.get("content-type") || "application/octet-stream";

  const put = await fetch(`${base}/${toPath}`, {
    method: "PUT",
    headers: { ...authed, "Content-Type": contentType },
    body: buf,
  });
  if (!put.ok) {
    const text = await put.text().catch(() => "");
    return Response.json(
      { error: `Upload to ${toPath} failed: ${put.status} ${text.slice(0, 200)}` },
      { status: 500 },
    );
  }

  const del = await fetch(`${base}/${fromPath}`, { method: "DELETE", headers: authed });
  if (!del.ok && del.status !== 404) {
    // File was copied but old couldn't be removed. Report, don't rollback.
    return Response.json(
      { error: `Copied but failed to delete old: ${del.status}`, path: toPath },
      { status: 500 },
    );
  }

  // Migrate media_meta if any
  const supabase = createAdminClient();
  await supabase.from("media_meta").delete().eq("filename", toPath);
  await supabase
    .from("media_meta")
    .update({ filename: toPath })
    .eq("filename", fromPath);

  return Response.json({ path: toPath });
}
