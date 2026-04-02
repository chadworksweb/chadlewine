import { createAdminClient } from "@/lib/supabase-server";

const BUCKET = "observation-audio";

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const formData = await request.formData();

  const file = formData.get("file") as File | null;
  const slug = formData.get("slug") as string | null;
  const observationId = formData.get("observation_id") as string | null;

  if (!file || !slug || !observationId) {
    return Response.json(
      { error: "file, slug, and observation_id required" },
      { status: 400 }
    );
  }

  const ext = file.name.split(".").pop() || "mp3";
  const path = `${slug}/reading.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

  // Update observation record
  const { error: updateError } = await supabase
    .from("observations")
    .update({ audio_file_path: publicUrl })
    .eq("id", observationId);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  return Response.json({ url: publicUrl, path }, { status: 201 });
}

export async function DELETE(request: Request) {
  const supabase = createAdminClient();
  const { observation_id, path } = await request.json();

  if (!observation_id || !path) {
    return Response.json({ error: "observation_id and path required" }, { status: 400 });
  }

  await supabase.storage.from(BUCKET).remove([path]);
  await supabase
    .from("observations")
    .update({ audio_file_path: null })
    .eq("id", observation_id);

  return Response.json({ ok: true });
}
