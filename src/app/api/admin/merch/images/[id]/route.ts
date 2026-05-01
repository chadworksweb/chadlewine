import { createAdminClient } from "@/lib/supabase-server";
import { syncDerivedProductColumns } from "@/lib/product-images";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PatchBody {
  alt?: string | null;
  is_primary?: boolean;
  is_hidden?: boolean;
  needs_review?: boolean;
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
    .from("product_images")
    .select("id, product_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) {
    return Response.json({ error: "Image not found" }, { status: 404 });
  }
  const productId = row.product_id as string;

  // Setting primary requires clearing any existing primary first to satisfy
  // the partial unique index. Statement-level checks tolerate the two updates
  // in sequence as long as the clear happens before the set.
  if (body.is_primary === true) {
    const { error: clearErr } = await supabase
      .from("product_images")
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq("product_id", productId)
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
  if (typeof body.needs_review === "boolean") updates.needs_review = body.needs_review;
  if (typeof body.position === "number") updates.position = body.position;

  const { data, error } = await supabase
    .from("product_images")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  await syncDerivedProductColumns(supabase, productId);

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
    .from("product_images")
    .select("id, product_id, source, is_primary")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) {
    return Response.json({ error: "Image not found" }, { status: 404 });
  }

  // Soft-delete the row. The nightly cleanup cron hard-deletes the Bunny file
  // (custom only) after 30 days. Printify rows just get marked — the file is
  // hosted by Printify, no cleanup needed.
  const { error } = await supabase
    .from("product_images")
    .update({
      deleted_at: new Date().toISOString(),
      is_primary: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  await syncDerivedProductColumns(supabase, row.product_id as string);

  return Response.json({ ok: true });
}
