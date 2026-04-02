import { createAdminClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "summary";
  const days = parseInt(searchParams.get("days") || "30", 10);

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();

  if (view === "summary") {
    const { data, error } = await supabase
      .from("analytics_daily_summary")
      .select("*")
      .gte("day", sinceStr)
      .order("day", { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Totals
    const totals = (data || []).reduce(
      (acc, d) => ({
        views: acc.views + (d.total_views || 0),
        sessions: acc.sessions + (d.unique_sessions || 0),
        audio_plays: acc.audio_plays + (d.audio_plays || 0),
        merch_clicks: acc.merch_clicks + (d.merch_clicks || 0),
        share_clicks: acc.share_clicks + (d.share_clicks || 0),
        patronage_clicks: acc.patronage_clicks + (d.patronage_clicks || 0),
      }),
      { views: 0, sessions: 0, audio_plays: 0, merch_clicks: 0, share_clicks: 0, patronage_clicks: 0 }
    );

    return Response.json({ daily: data, totals });
  }

  if (view === "pages") {
    const { data, error } = await supabase
      .from("analytics_daily_pages")
      .select("*")
      .gte("day", sinceStr)
      .order("views", { ascending: false })
      .limit(100);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Aggregate by page_path
    const byPage: Record<string, { views: number; sessions: number; avg_time: number; avg_scroll: number; count: number }> = {};
    for (const row of data || []) {
      const key = row.page_path;
      if (!byPage[key]) byPage[key] = { views: 0, sessions: 0, avg_time: 0, avg_scroll: 0, count: 0 };
      byPage[key].views += row.views || 0;
      byPage[key].sessions += row.unique_sessions || 0;
      if (row.avg_time_seconds) { byPage[key].avg_time += row.avg_time_seconds; byPage[key].count++; }
      if (row.avg_scroll_pct) { byPage[key].avg_scroll += row.avg_scroll_pct; }
    }

    const pages = Object.entries(byPage)
      .map(([path, d]) => ({
        page_path: path,
        views: d.views,
        sessions: d.sessions,
        avg_time_seconds: d.count > 0 ? Math.round(d.avg_time / d.count) : null,
        avg_scroll_pct: d.count > 0 ? Math.round(d.avg_scroll / d.count) : null,
      }))
      .sort((a, b) => b.views - a.views);

    return Response.json({ pages });
  }

  if (view === "observations") {
    const { data, error } = await supabase
      .from("analytics_observation_totals")
      .select("*")
      .order("total_views", { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Join with observation titles
    const ids = (data || []).map((d) => d.observation_id).filter(Boolean);
    const { data: observations } = await supabase
      .from("observations")
      .select("id, title, slug")
      .in("id", ids);

    const obsMap = new Map((observations || []).map((o) => [o.id, o]));

    const enriched = (data || []).map((d) => ({
      ...d,
      title: obsMap.get(d.observation_id)?.title || "Unknown",
      slug: obsMap.get(d.observation_id)?.slug || "",
    }));

    return Response.json({ observations: enriched });
  }

  if (view === "counts") {
    // Quick counts for dashboard cards
    const [
      { count: subscriberCount },
      { count: patronCount },
      { count: purchaseCount },
      { count: voiceCount },
    ] = await Promise.all([
      supabase.from("subscribers").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("patrons").select("*", { count: "exact", head: true }),
      supabase.from("purchases").select("*", { count: "exact", head: true }),
      supabase.from("voice_messages").select("*", { count: "exact", head: true }).eq("status", "new"),
    ]);

    return Response.json({
      subscribers: subscriberCount || 0,
      patrons: patronCount || 0,
      purchases: purchaseCount || 0,
      voice_messages_new: voiceCount || 0,
    });
  }

  return Response.json({ error: "Unknown view" }, { status: 400 });
}
