import { createPublicClient } from "@/lib/supabase-server";

// GET /api/observations/[slug]/revisions — public revision history
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = createPublicClient();

  // Get observation ID from slug
  const { data: obs } = await supabase
    .from("observations")
    .select("id, date_captured, published_at, created_at")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (!obs) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Get all revisions
  const { data: revisions } = await supabase
    .from("observation_revisions")
    .select("id, revision_number, title, body, change_summary, created_at")
    .eq("observation_id", obs.id)
    .order("revision_number", { ascending: true });

  return Response.json({
    date_captured: obs.date_captured,
    published_at: obs.published_at,
    created_at: obs.created_at,
    revisions: revisions || [],
  });
}
