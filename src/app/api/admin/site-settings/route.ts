import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("site_settings")
    .select("key, value");

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const settings: Record<string, string> = {};
  for (const row of data || []) settings[row.key] = row.value;
  return Response.json(settings);
}

export async function PUT(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();

  const updates = Object.entries(body) as [string, string][];
  for (const [key, value] of updates) {
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
