import { createAdminClient } from "@/lib/supabase-server";
import { mintGrant } from "@/lib/fan-tracks";

// Admin grant management for a fan_track.
//   POST { email } -- mint a grant for the audience with that email
//   DELETE { audience_id } -- revoke a grant

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  if (!email) return Response.json({ error: "email required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: track } = await supabase
    .from("fan_tracks")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!track) return Response.json({ error: "Track not found" }, { status: 404 });

  const { data: audience } = await supabase
    .from("audience")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!audience) {
    return Response.json({ error: "No audience row for that email" }, { status: 404 });
  }

  const grant = await mintGrant({
    fan_track_id: track.id,
    audience_id: audience.id,
    granted_via: "manual",
  });
  return Response.json({ ok: true, grant });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  let body: { audience_id?: string };
  try {
    body = (await request.json()) as { audience_id?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.audience_id) {
    return Response.json({ error: "audience_id required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: track } = await supabase
    .from("fan_tracks")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!track) return Response.json({ error: "Track not found" }, { status: 404 });

  const { error } = await supabase
    .from("fan_track_grants")
    .delete()
    .eq("fan_track_id", track.id)
    .eq("audience_id", body.audience_id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
