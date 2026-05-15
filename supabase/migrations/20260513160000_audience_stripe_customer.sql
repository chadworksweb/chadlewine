-- Persistent Stripe Customer per audience row. Lets us route returning
-- customers through Stripe Customer Portal (self-service payment methods,
-- billing address, invoices) without storing card data ourselves.
alter table public.audience
  add column if not exists stripe_customer_id text unique;

create index if not exists idx_audience_stripe_customer
  on public.audience (stripe_customer_id);
