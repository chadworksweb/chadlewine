-- Auth surface hardening — rate limit + lockout + audit.
-- Every login/register/reset attempt logs to auth_attempts (forensics +
-- rate-limit math). user_lockouts tracks per-email failure streaks.

create table if not exists public.auth_attempts (
  id uuid primary key default gen_random_uuid(),
  email text,
  ip text,
  user_agent text,
  action text not null,           -- login | register | password_reset | admin_login
  success boolean not null,
  reason text,
  created_at timestamptz default now()
);
create index if not exists idx_auth_attempts_email_action_created
  on public.auth_attempts (lower(email), action, created_at desc);
create index if not exists idx_auth_attempts_ip_action_created
  on public.auth_attempts (ip, action, created_at desc);
alter table public.auth_attempts enable row level security;
drop policy if exists "Admin all auth_attempts" on public.auth_attempts;
create policy "Admin all auth_attempts" on public.auth_attempts
  for all to authenticated using (true) with check (true);

create table if not exists public.user_lockouts (
  email text primary key,
  failed_count int not null default 0,
  last_failure_at timestamptz default now(),
  locked_until timestamptz
);
alter table public.user_lockouts enable row level security;
drop policy if exists "Admin all user_lockouts" on public.user_lockouts;
create policy "Admin all user_lockouts" on public.user_lockouts
  for all to authenticated using (true) with check (true);
