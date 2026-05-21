-- Drop columns left over from the original /fan-song flow.
--
-- The "fan-ode" path (one global is_current_fan_ode song + a single
-- per-audience fan_ode_token on /fan-song) was replaced by the
-- /for-my-fans-XX system: many fan_tracks rows, per-(audience, track)
-- grants in fan_track_grants, tokens minted on the grant row.
--
-- Kept on purpose:
--   audience.fan_ode_drip_sent_at -- still used by the drip cron at
--     /api/cron/fan-track-drip for "have we already drip-emailed this
--     audience" idempotency. Rename in a future cleanup migration if
--     desired.

-- songs.is_current_fan_ode + its partial unique index.
drop index if exists public.idx_one_current_fan_ode;
alter table public.songs drop column if exists is_current_fan_ode;

-- audience.fan_ode_token + its unique constraint (auto-dropped with the
-- column).
alter table public.audience drop column if exists fan_ode_token;
