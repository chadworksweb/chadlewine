import { createAdminClient } from "@/lib/supabase-server";

const BUCKET = "observation-images";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// GET /api/admin/media — list all images with meta
export async function GET() {
  const supabase = createAdminClient();

  const { data: files, error } = await supabase.storage
    .from(BUCKET)
    .list("", { limit: 500, sortBy: { column: "created_at", order: "desc" } });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const baseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;

  const filenames = (files || [])
    .filter((f) => !f.id?.endsWith("/") && f.name !== ".emptyFolderPlaceholder")
    .map((f) => f.name);

  // Fetch meta for all files
  const { data: metaRows } = await supabase
    .from("media_meta")
    .select("filename, alt_text, title")
    .in("filename", filenames);

  const metaMap = new Map<string, { alt_text: string; title: string }>();
  metaRows?.forEach((m) => metaMap.set(m.filename, m));

  const images = filenames.map((name) => {
    const meta = metaMap.get(name);
    return {
      name,
      url: `${baseUrl}/${name}`,
      alt_text: meta?.alt_text || "",
      title: meta?.title || "",
    };
  });

  return Response.json(images);
}

// POST /api/admin/media — upload an image
export async function POST(request: Request) {
  const supabase = createAdminClient();

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json(
      { error: "Only jpg, png, gif, and webp files are allowed" },
      { status: 400 }
    );
  }

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
  const filename = `${timestamp}-${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Create meta row
  await supabase.from("media_meta").insert({
    filename,
    alt_text: "",
    title: "",
  });

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filename}`;

  return Response.json({ url, name: filename }, { status: 201 });
}

// PUT /api/admin/media — update image meta (alt_text, title)
export async function PUT(request: Request) {
  const supabase = createAdminClient();
  const { filename, alt_text, title } = await request.json();

  if (!filename) {
    return Response.json({ error: "No filename provided" }, { status: 400 });
  }

  // Upsert — create if missing, update if exists
  const { error } = await supabase
    .from("media_meta")
    .upsert(
      { filename, alt_text: alt_text || "", title: title || "" },
      { onConflict: "filename" }
    );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

// DELETE /api/admin/media — delete an image + its meta
export async function DELETE(request: Request) {
  const supabase = createAdminClient();
  const { name } = await request.json();

  if (!name) {
    return Response.json({ error: "No filename provided" }, { status: 400 });
  }

  const { error } = await supabase.storage.from(BUCKET).remove([name]);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Clean up meta
  await supabase.from("media_meta").delete().eq("filename", name);

  return Response.json({ ok: true });
}
