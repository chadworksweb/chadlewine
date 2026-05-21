import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-server";
import { FanTrackAdminEditor, type FanTrackDetailData } from "@/components/FanTrackAdminEditor";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function FanTrackAdminDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: track } = await supabase
    .from("fan_tracks")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!track) notFound();

  const { data: grants } = await supabase
    .from("fan_track_grants")
    .select(
      "id, audience_id, token, granted_at, granted_via, invite_email_sent_at, first_played_at, last_played_at, play_count",
    )
    .eq("fan_track_id", track.id)
    .order("granted_at", { ascending: false });

  const audienceIds = (grants || []).map((g) => g.audience_id);
  const audienceMap = new Map<string, { id: string; email: string; display_name: string | null; user_id: string | null }>();
  if (audienceIds.length > 0) {
    const { data: rows } = await supabase
      .from("audience")
      .select("id, email, display_name, user_id")
      .in("id", audienceIds);
    for (const r of rows || []) audienceMap.set(r.id, r);
  }

  const initial: FanTrackDetailData = {
    track,
    grants: (grants || []).map((g) => ({
      ...g,
      audience: audienceMap.get(g.audience_id) ?? null,
    })),
  };

  return <FanTrackAdminEditor initial={initial} />;
}
