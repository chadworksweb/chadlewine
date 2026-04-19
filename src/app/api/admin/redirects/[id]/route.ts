import { createAdminClient } from "@/lib/supabase-server";

function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let p = raw.trim();
  if (!p) return null;
  if (p.startsWith("http://") || p.startsWith("https://")) {
    try {
      const u = new URL(p);
      p = u.pathname + u.search + u.hash;
    } catch {
      return null;
    }
  }
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1 && p.endsWith("/")) p = p.replace(/\/+$/, "");
  return p;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("from_path" in body) {
    const p = normalizePath(body.from_path);
    if (!p) return Response.json({ error: "invalid from_path" }, { status: 400 });
    updates.from_path = p;
  }
  if ("to_path" in body) {
    const p = normalizePath(body.to_path);
    if (!p) return Response.json({ error: "invalid to_path" }, { status: 400 });
    updates.to_path = p;
  }
  if ("status_code" in body) {
    if (![301, 302, 307, 308].includes(body.status_code)) {
      return Response.json({ error: "status_code must be 301/302/307/308" }, { status: 400 });
    }
    updates.status_code = body.status_code;
  }
  if ("active" in body) updates.active = !!body.active;
  if ("notes" in body) updates.notes = typeof body.notes === "string" ? body.notes : null;

  if (
    typeof updates.from_path === "string" &&
    typeof updates.to_path === "string" &&
    updates.from_path === updates.to_path
  ) {
    return Response.json({ error: "from_path and to_path must differ" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("redirects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("redirects").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
