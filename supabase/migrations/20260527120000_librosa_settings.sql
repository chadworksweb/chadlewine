-- Librosa visualizer settings: a single global "defaults" row plus a
-- per-song override column. The lever registry lives in
-- src/lib/librosa-levers.ts; this only stores values, keyed by lever id.
--
-- Read paths:
--   - Public song page (anon client) reads librosa_settings to merge the
--     RENDER levers for the cube. So anon needs SELECT here.
--   - The Python analyzers (service_role) read the merged ANALYZER levers
--     before a scan.
-- Write paths: admin API routes only, via service_role.

create table if not exists public.librosa_settings (
  id smallint primary key default 1,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  -- Enforce the singleton: only one row, always id = 1.
  constraint librosa_settings_singleton check (id = 1)
);

-- Seed the singleton row so GET always has something to read. Empty config
-- means "every lever inherits its registry default".
insert into public.librosa_settings (id, config)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

alter table public.librosa_settings enable row level security;

-- Anon may read global defaults (public render path). Writes are
-- service-role only (admin routes), which bypasses RLS.
revoke all on public.librosa_settings from anon, authenticated;
grant select on public.librosa_settings to anon, authenticated;
grant all on public.librosa_settings to service_role;

-- Per-song render/analyzer overrides. Sparse: only the lever ids that
-- differ from the global default are stored. NULL/empty = full inherit.
-- Lives on the already-public songs table, so the public page reads it
-- with the row; no extra grants needed.
alter table public.songs
  add column if not exists visualizer_overrides jsonb not null default '{}'::jsonb;

comment on column public.songs.visualizer_overrides is
  'Sparse per-song overrides of librosa lever defaults, keyed by lever id (see src/lib/librosa-levers.ts). Merged over librosa_settings.config at read time.';
