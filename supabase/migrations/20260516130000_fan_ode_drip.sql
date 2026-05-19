-- Fan-ode drip: 24h post first-order trigger that emails a single gifted
-- song to first-time buyers. The song is swappable via is_current_fan_ode
-- on songs (partial unique index keeps only one song active at a time).
-- Audience side tracks drip-sent state + a per-audience token used as the
-- shareable but un-guessable gate on /fan-song.

alter table public.songs
  add column if not exists is_current_fan_ode boolean not null default false;

create unique index if not exists idx_one_current_fan_ode
  on public.songs (is_current_fan_ode)
  where is_current_fan_ode = true;

alter table public.audience
  add column if not exists fan_ode_drip_sent_at timestamptz,
  add column if not exists fan_ode_token text unique;

create index if not exists idx_audience_fan_ode_drip_sent_at
  on public.audience (fan_ode_drip_sent_at);
