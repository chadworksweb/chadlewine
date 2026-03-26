import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("voice_profile")
    .select("content")
    .limit(1)
    .single();

  return Response.json({ content: data?.content || "" });
}

export async function PUT(request: Request) {
  const { content } = await request.json();
  const supabase = createAdminClient();

  // Get the single row
  const { data: existing } = await supabase
    .from("voice_profile")
    .select("id")
    .limit(1)
    .single();

  if (existing) {
    await supabase
      .from("voice_profile")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("voice_profile")
      .insert({ content });
  }

  return Response.json({ ok: true });
}
