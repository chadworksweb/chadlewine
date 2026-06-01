import { createAdminClient } from "@/lib/supabase-server";
import { audienceCount, type AudienceFilter } from "@/lib/campaigns";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = createAdminClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("audience_filter, category")
    .eq("id", id)
    .single();

  if (!campaign) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const count = await audienceCount(
      supabase,
      campaign.audience_filter || {},
      campaign.category,
    );
    return Response.json({ count });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

// POST — preview a count for an arbitrary filter, before autosave persists
// it. The editor uses this to live-update the audience number as the user
// edits tag chips.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = createAdminClient();
  const body = (await request.json().catch(() => ({}))) as {
    filter?: AudienceFilter;
    category?: string | null;
  };
  try {
    const count = await audienceCount(supabase, body.filter || {}, body.category);
    return Response.json({ count });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
