-- Inquiries from the /songwriting contact form.
-- Service-role only: the API route (and any future admin view) use the
-- service-role client, which bypasses RLS. No anon/authenticated access is
-- granted, because rows hold PII and links to uploaded files.

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  location text,
  files jsonb not null default '[]'::jsonb,
  ip text,
  user_agent text,
  referer text,
  source text not null default 'songwriting',
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists idx_inquiries_created on public.inquiries (created_at desc);
create index if not exists idx_inquiries_email on public.inquiries ((lower(email)));

alter table public.inquiries enable row level security;

-- No policies for anon/authenticated, so only service_role (which bypasses
-- RLS) can read or write. Explicit grants per project convention.
revoke all on public.inquiries from anon, authenticated;
grant all on public.inquiries to service_role;

-- Private bucket for inquiry file attachments. The service role uploads files
-- and mints signed URLs; there is no public access and no storage policies.
insert into storage.buckets (id, name, public)
values ('inquiry-files', 'inquiry-files', false)
on conflict (id) do nothing;
