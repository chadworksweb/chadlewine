-- Daily page view rollups
CREATE OR REPLACE VIEW analytics_daily_pages AS
SELECT
  date_trunc('day', created_at)::date AS day,
  page_path,
  observation_id,
  meditation_id,
  count(*) FILTER (WHERE event_type = 'page_view') AS views,
  count(DISTINCT session_id) FILTER (WHERE event_type = 'page_view') AS unique_sessions,
  avg((metadata->>'duration_seconds')::numeric) FILTER (WHERE event_type = 'time_on_page') AS avg_time_seconds,
  avg((metadata->>'max_percent')::numeric) FILTER (WHERE event_type = 'scroll_depth') AS avg_scroll_pct
FROM analytics_events
GROUP BY day, page_path, observation_id, meditation_id;

-- Daily site-wide summary
CREATE OR REPLACE VIEW analytics_daily_summary AS
SELECT
  date_trunc('day', created_at)::date AS day,
  count(*) FILTER (WHERE event_type = 'page_view') AS total_views,
  count(DISTINCT session_id) FILTER (WHERE event_type = 'page_view') AS unique_sessions,
  count(*) FILTER (WHERE event_type = 'audio_play') AS audio_plays,
  count(*) FILTER (WHERE event_type = 'merch_click') AS merch_clicks,
  count(*) FILTER (WHERE event_type = 'share_click') AS share_clicks,
  count(*) FILTER (WHERE event_type = 'patronage_click') AS patronage_clicks
FROM analytics_events
GROUP BY day;

-- Per-observation rollup (all time)
CREATE OR REPLACE VIEW analytics_observation_totals AS
SELECT
  observation_id,
  count(*) FILTER (WHERE event_type = 'page_view') AS total_views,
  count(DISTINCT session_id) FILTER (WHERE event_type = 'page_view') AS unique_sessions,
  avg((metadata->>'duration_seconds')::numeric) FILTER (WHERE event_type = 'time_on_page') AS avg_time_seconds,
  avg((metadata->>'max_percent')::numeric) FILTER (WHERE event_type = 'scroll_depth') AS avg_scroll_pct,
  count(*) FILTER (WHERE event_type = 'audio_play') AS audio_plays,
  count(*) FILTER (WHERE event_type = 'merch_click') AS merch_clicks,
  count(*) FILTER (WHERE event_type = 'share_click') AS share_clicks
FROM analytics_events
WHERE observation_id IS NOT NULL
GROUP BY observation_id;

-- Per-meditation rollup (all time)
CREATE OR REPLACE VIEW analytics_meditation_totals AS
SELECT
  meditation_id,
  count(*) FILTER (WHERE event_type = 'page_view') AS total_views,
  count(DISTINCT session_id) FILTER (WHERE event_type = 'page_view') AS unique_sessions,
  count(*) FILTER (WHERE event_type = 'share_click') AS share_clicks
FROM analytics_events
WHERE meditation_id IS NOT NULL
GROUP BY meditation_id;
