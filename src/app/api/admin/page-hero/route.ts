import { createAdminClient } from "@/lib/supabase-server";

// GET /api/admin/page-hero?page=meditations — get current hero image URL
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") || "meditations";
  const supabase = createAdminClient();

  const { data } = supabase.storage
    .from("observation-images")
    .getPublicUrl(`page-heroes/${page}.webp`);

  return Response.json({ url: data?.publicUrl || "" });
}

// POST /api/admin/page-hero — upload/replace hero image
export async function POST(request: Request) {
  const supabase = createAdminClient();
  const formData = await request.formData();
  const file = formData.get("file") as File;
  const page = (formData.get("page") as string) || "meditations";

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const path = `page-heroes/${page}.webp`;

  const { error } = await supabase.storage
    .from("observation-images")
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
    });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage
    .from("observation-images")
    .getPublicUrl(path);

  return Response.json({ url: data?.publicUrl || "" });
}
