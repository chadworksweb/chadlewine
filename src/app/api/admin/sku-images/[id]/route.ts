import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PatchBody {
  alt?: string | null;
  is_primary?: boolean;
  is_hidden?: boolean;
  position?: number;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "id must be uuid" }, { status: 400 });
  }
  const body = (await request.json()) as PatchBody;
  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("sku_images")
    .select("id, release_sku_id, song_sku_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) {
    return Response.json({ error: "Image not found" }, { status: 404 });
  }

  // Setting primary requires clearing any existing primary on the same
  // parent first (partial unique index disallows two primaries).
  if (body.is_primary === true) {
    const parentCol = row.release_sku_id ? "release_sku_id" : "song_sku_id";
    const parentId = (row.release_sku_id as string | null) ?? (row.song_sku_id as string);
    const { error: clearErr } = await supabase
      .from("sku_images")
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq(parentCol, parentId)
      .eq("is_primary", true)
      .neq("id", id);
    if (clearErr) {
      return Response.json({ error: clearErr.message }, { status: 500 });
    }
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if ("alt" in body) updates.alt = body.alt;
  if (typeof body.is_primary === "boolean") updates.is_primary = body.is_primary;
  if (typeof body.is_hidden === "boolean") updates.is_hidden = body.is_hidden;
  if (typeof body.position === "number") updates.position = body.position;

  const { data, error } = await supabase
    .from("sku_images")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ image: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "id must be uuid" }, { status: 400 });
  }
  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("sku_images")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) {
    return Response.json({ error: "Image not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("sku_images")
    .update({
      deleted_at: new Date().toISOString(),
      is_primary: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
