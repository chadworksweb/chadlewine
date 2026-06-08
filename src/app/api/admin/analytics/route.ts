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
      .from("posts")
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
    ] = await Promise.all([
      supabase.from("subscribers").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("patrons").select("*", { count: "exact", head: true }),
      supabase.from("purchases").select("*", { count: "exact", head: true }),
    ]);

    return Response.json({
      subscribers: subscriberCount || 0,
      patrons: patronCount || 0,
      purchases: purchaseCount || 0,
    });
  }

  if (view === "plays") {
    const now = Date.now();
    const since7 = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const since30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: events, error } = await supabase
      .from("song_play_events")
      .select("song_id, played_at, seconds_played")
      .order("played_at", { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    type Agg = {
      total: number;
      plays_7d: number;
      plays_30d: number;
      seconds_sum: number;
      last_played_at: string | null;
    };
    const bySong: Record<string, Agg> = {};
    for (const e of (events || []) as { song_id: string; played_at: string; seconds_played: number }[]) {
      const a = (bySong[e.song_id] ||= {
        total: 0,
        plays_7d: 0,
        plays_30d: 0,
        seconds_sum: 0,
        last_played_at: null,
      });
      a.total++;
      a.seconds_sum += e.seconds_played || 0;
      if (e.played_at >= since7) a.plays_7d++;
      if (e.played_at >= since30) a.plays_30d++;
      if (!a.last_played_at || e.played_at > a.last_played_at) {
        a.last_played_at = e.played_at;
      }
    }

    const songIds = Object.keys(bySong);
    let songs: { id: string; title: string; slug: string }[] = [];
    if (songIds.length > 0) {
      const { data } = await supabase
        .from("songs")
        .select("id, title, slug")
        .in("id", songIds);
      songs = (data || []) as typeof songs;
    }
    const titleMap = new Map(songs.map((s) => [s.id, s]));

    const rows = Object.entries(bySong)
      .map(([sid, a]) => ({
        song_id: sid,
        title: titleMap.get(sid)?.title || "(deleted song)",
        slug: titleMap.get(sid)?.slug || null,
        total_plays: a.total,
        plays_7d: a.plays_7d,
        plays_30d: a.plays_30d,
        avg_seconds: a.total > 0 ? Math.round(a.seconds_sum / a.total) : 0,
        last_played_at: a.last_played_at,
      }))
      .sort(
        (a, b) =>
          b.plays_30d - a.plays_30d ||
          b.total_plays - a.total_plays ||
          a.title.localeCompare(b.title),
      );

    const totals = {
      total_plays: rows.reduce((s, r) => s + r.total_plays, 0),
      plays_7d: rows.reduce((s, r) => s + r.plays_7d, 0),
      plays_30d: rows.reduce((s, r) => s + r.plays_30d, 0),
    };

    return Response.json({ rows, totals });
  }

  return Response.json({ error: "Unknown view" }, { status: 400 });
}
