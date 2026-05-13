-- Manual unsubscribe requests. Anyone can submit (no auth, no token);
-- admin reviews, matches against subscribers, and flips status. The
-- request row tracks who/when/processed for audit.
create table if not exists public.unsubscribe_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  reason text,
  source_page text,
  status text not null default 'pending',  -- pending | processed | dismissed
  processed_at timestamptz,
  processed_subscriber_id uuid references public.subscribers(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_unsubscribe_requests_status
  on public.unsubscribe_requests (status);
create index if not exists idx_unsubscribe_requests_email
  on public.unsubscribe_requests (lower(email));

alter table public.unsubscribe_requests enable row level security;

-- Anyone can submit a manual unsubscribe request. Limits are enforced
-- in the route handler.
drop policy if exists "Public submit unsubscribe request"
  on public.unsubscribe_requests;
create policy "Public submit unsubscribe request" on public.unsubscribe_requests
  for insert with check (true);

drop policy if exists "Admin all unsubscribe_requests"
  on public.unsubscribe_requests;
create policy "Admin all unsubscribe_requests" on public.unsubscribe_requests
  for all to authenticated using (true) with check (true);
