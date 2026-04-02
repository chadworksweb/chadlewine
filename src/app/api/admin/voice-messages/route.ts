import { createAdminClient } from "@/lib/supabase-server";

const BUCKET = "voice-messages";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("voice_messages")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Generate signed URLs for each message
  const messages = await Promise.all(
    (data || []).map(async (msg) => {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(msg.audio_storage_path, 60 * 30); // 30 min

      return {
        ...msg,
        audio_url: signed?.signedUrl || null,
      };
    })
  );

  return Response.json(messages);
}

export async function PUT(request: Request) {
  const supabase = createAdminClient();
  const { id, status } = await request.json();

  if (!id || !status || !["new", "listened", "archived"].includes(status)) {
    return Response.json({ error: "id and status (new/listened/archived) required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("voice_messages")
    .update({ status })
    .eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = createAdminClient();
  const { id, path } = await request.json();

  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  if (path) {
    await supabase.storage.from(BUCKET).remove([path]);
  }
  const { error } = await supabase.from("voice_messages").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
