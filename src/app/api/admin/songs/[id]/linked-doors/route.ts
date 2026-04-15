import { createAdminClient } from "@/lib/supabase-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("door_page_songs")
    .select("door_page:door_pages(id, title, slug, status)")
    .eq("song_id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const doors = (data || [])
    .map((row: { door_page: unknown }) => row.door_page as {
      id: string;
      title: string;
      slug: string;
      status: string;
    } | null)
    .filter((d): d is NonNullable<typeof d> => !!d)
    .sort((a, b) => a.title.localeCompare(b.title));

  return Response.json(doors);
}
