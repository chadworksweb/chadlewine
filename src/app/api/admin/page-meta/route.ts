import { createAdminClient } from "@/lib/supabase-server";
import { MANAGED_PAGES } from "@/lib/managed-pages";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("page_meta").select("*");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const map = new Map((data || []).map((r: { route: string }) => [r.route, r]));
  const rows = MANAGED_PAGES.map((p) => ({
    route: p.route,
    label: p.label,
    meta: map.get(p.route) || null,
  }));
  return Response.json(rows);
}

export async function PUT(request: Request) {
  const body = await request.json();
  const { route, title, description, og_image_path } = body as {
    route: string;
    title: string | null;
    description: string | null;
    og_image_path: string | null;
  };

  if (!route || !MANAGED_PAGES.some((p) => p.route === route)) {
    return Response.json({ error: "unknown route" }, { status: 400 });
  }

  const norm = (v: string | null | undefined) => {
    if (v == null) return null;
    const t = v.trim();
    return t === "" ? null : t;
  };

  const supabase = createAdminClient();
  const { error } = await supabase.from("page_meta").upsert(
    {
      route,
      title: norm(title),
      description: norm(description),
      og_image_path: norm(og_image_path),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "route" }
  );

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
