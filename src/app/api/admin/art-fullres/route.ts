import { createAdminClient } from "@/lib/supabase-server";

const BUCKET = "art-fullres";

// POST — upload a full-res art file (print or wallpaper)
export async function POST(request: Request) {
  const supabase = createAdminClient();
  const formData = await request.formData();

  const file = formData.get("file") as File | null;
  const slug = formData.get("slug") as string | null;
  const variant = formData.get("variant") as string | null; // "print" or "wallpaper"

  if (!file || !slug || !variant || !["print", "wallpaper"].includes(variant)) {
    return Response.json(
      { error: "file, slug, and variant (print|wallpaper) required" },
      { status: 400 }
    );
  }

  const ext = variant === "wallpaper" ? "webp" : file.name.split(".").pop() || "png";
  const path = `${slug}/${variant}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "0",
      upsert: true,
    });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  // Update observation record
  const column =
    variant === "print"
      ? "art_fullres_print_path"
      : "art_fullres_wallpaper_path";

  const { error: updateError } = await supabase
    .from("observations")
    .update({ [column]: path })
    .eq("slug", slug);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  return Response.json({ path }, { status: 201 });
}

// GET — generate a signed URL for a full-res file
export async function GET(request: Request) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");

  if (!path) {
    return Response.json({ error: "path required" }, { status: 400 });
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 10); // 10 min expiry

  if (error || !data?.signedUrl) {
    return Response.json({ error: error?.message || "Failed to sign" }, { status: 500 });
  }

  return Response.json({ url: data.signedUrl });
}
