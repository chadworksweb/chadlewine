-- Member coupons. One member can claim at most one coupon per source
-- (e.g. 'cart_thankyou_offer'). Stripe Coupon + Promotion Code created
-- at claim time; the code is what the member types at checkout.

create table if not exists public.member_coupons (
  id uuid primary key default gen_random_uuid(),
  audience_id uuid not null references public.audience(id) on delete cascade,

  -- Source of the grant. Used to enforce once-per-member by source.
  source text not null,

  -- Plain Stripe Promotion Code that the member types at checkout.
  code text not null unique,
  percent_off int not null default 20 check (percent_off > 0 and percent_off <= 100),

  -- Stripe identifiers so we can void / inspect later.
  stripe_coupon_id text,
  stripe_promotion_code_id text,

  -- Lifecycle.
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_order_id uuid references public.orders(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enforce once-per-member-per-source at the DB level. A member who already
-- has any coupon from this source (claimed but unused, used, or expired)
-- cannot claim again.
create unique index if not exists idx_member_coupons_audience_source
  on public.member_coupons (audience_id, source);

create index if not exists idx_member_coupons_code on public.member_coupons (code);
create index if not exists idx_member_coupons_audience on public.member_coupons (audience_id);

-- Grants. Supabase will be removing default grants on new projects starting
-- 2026-05-30 and existing ones 2026-10-30; explicit grants future-proof us.
grant select, insert, update, delete on public.member_coupons to service_role;
grant select on public.member_coupons to authenticated;

alter table public.member_coupons enable row level security;

drop policy if exists "Admin all member_coupons" on public.member_coupons;
create policy "Admin all member_coupons" on public.member_coupons
  for all to authenticated using (true) with check (true);

-- Customer self-read: a member can see their own coupons on the account
-- dashboard. Match by joining audience.user_id = auth.uid().
drop policy if exists "Member self-read member_coupons" on public.member_coupons;
create policy "Member self-read member_coupons" on public.member_coupons
  for select to authenticated using (
    audience_id in (select id from public.audience where user_id = auth.uid())
  );
