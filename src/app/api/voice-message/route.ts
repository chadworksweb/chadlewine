import { createAdminClient } from "@/lib/supabase-server";

const BUCKET = "voice-messages";

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const formData = await request.formData();

  const file = formData.get("file") as File | null;
  const durationStr = formData.get("duration_seconds") as string | null;

  if (!file) {
    return Response.json({ error: "No audio file provided" }, { status: 400 });
  }

  const duration = durationStr ? parseInt(durationStr, 10) : null;
  const timestamp = Date.now();
  const ext = file.name.split(".").pop() || "webm";
  const path = `${timestamp}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "0",
    });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  const { error: dbError } = await supabase.from("voice_messages").insert({
    audio_storage_path: path,
    duration_seconds: duration,
    status: "new",
  });

  if (dbError) {
    return Response.json({ error: dbError.message }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 201 });
}
