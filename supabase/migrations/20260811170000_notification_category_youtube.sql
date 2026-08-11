-- Notification category: New YouTube Video
-- Adds a 7th optional email category.
-- Builds on 20260531120000_notification_categories.sql.
--
-- Same opt-out model as the other categories:
-- a boolean on public.audience, default true, so every
-- existing subscriber stays opted in.
-- A campaign tagged category='youtube_video' skips any
-- row whose column is false.
--
-- audience already has RLS and all writes go through the
-- service-role admin client, so no new grants or policies.

alter table public.audience
  add column if not exists notify_youtube_video boolean not null default true;
