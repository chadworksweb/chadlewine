-- Booking inquiries from the Super Individual Night booking page
-- (/about/booking?inquiry=1). Distinct shape from public.inquiries: no required
-- file attachments, and it carries the venue/night logistics plus the
-- co-curated setlist the host suggests.
--
-- Service-role only: the /api/book route uses the service-role client, which
-- bypasses RLS. No anon/authenticated access -- rows hold PII (contact info).

create table if not exists public.booking_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  space_name text,
  location text,
  room_type text,
  capacity text,
  dates text,
  exchange text,
  -- Array of { title } (and id when available) for the suggested set. Empty
  -- when the host hands the arc to Chad (let_chad = true).
  setlist jsonb not null default '[]'::jsonb,
  let_chad boolean not null default false,
  message text,
  ip text,
  user_agent text,
  referer text,
  source text not null default 'booking',
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists idx_booking_inquiries_created on public.booking_inquiries (created_at desc);
create index if not exists idx_booking_inquiries_email on public.booking_inquiries ((lower(email)));

alter table public.booking_inquiries enable row level security;

-- No policies for anon/authenticated, so only service_role (which bypasses
-- RLS) can read or write. Explicit grants per project convention.
revoke all on public.booking_inquiries from anon, authenticated;
grant all on public.booking_inquiries to service_role;
