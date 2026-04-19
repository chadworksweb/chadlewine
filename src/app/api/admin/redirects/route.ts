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

export async function GET(request: Request) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";
  const source = searchParams.get("source") || "";

  let query = supabase
    .from("redirects")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (q) {
    query = query.or(`from_path.ilike.%${q}%,to_path.ilike.%${q}%`);
  }
  if (source === "auto" || source === "manual") {
    query = query.eq("source", source);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();

  const from_path = normalizePath(body.from_path);
  const to_path = normalizePath(body.to_path);
  if (!from_path) return Response.json({ error: "from_path required" }, { status: 400 });
  if (!to_path) return Response.json({ error: "to_path required" }, { status: 400 });
  if (from_path === to_path) {
    return Response.json({ error: "from_path and to_path must differ" }, { status: 400 });
  }

  const status_code = [301, 302, 307, 308].includes(body.status_code) ? body.status_code : 301;
  const active = body.active !== false;
  const notes = typeof body.notes === "string" ? body.notes : null;

  const { data, error } = await supabase
    .from("redirects")
    .insert({
      from_path,
      to_path,
      status_code,
      source: "manual",
      active,
      notes,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
