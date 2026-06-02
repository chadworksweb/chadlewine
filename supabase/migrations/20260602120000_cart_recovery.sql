-- Abandoned-cart recovery: one row per recovery email sent (or attempted).
-- The unique stripe_session_id is the idempotency key: a given abandoned
-- Stripe Checkout session is only ever emailed once. Admin/service-role only.

create table if not exists public.cart_recovery_emails (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  email text not null,
  audience_id uuid references public.audience(id) on delete set null,
  resume_url text,
  item_count integer not null default 0,
  cart_total numeric(10,2) not null default 0,
  discount_percent integer not null default 0,
  coupon_code text,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists cart_recovery_emails_email_idx
  on public.cart_recovery_emails (email, sent_at desc);

alter table public.cart_recovery_emails enable row level security;

create policy "Admin full access cart_recovery_emails"
  on public.cart_recovery_emails for all using (auth.role() = 'authenticated');

grant all on public.cart_recovery_emails to service_role;
grant select, insert, update, delete on public.cart_recovery_emails to authenticated;
