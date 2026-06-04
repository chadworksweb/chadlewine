-- Monthly (recurring) patronage support.
--
-- The patrons table already carries is_recurring + stripe_subscription_id from
-- the initial schema. Monthly patronage records one patrons row per paid
-- invoice (the first charge and every renewal), driven by the invoice.paid
-- webhook. Each invoice is unique, so we dedup on the Stripe invoice id to make
-- the webhook idempotent under Stripe's at-least-once delivery.
--
-- One-time gifts leave stripe_invoice_id null and continue to dedup on the
-- payment intent within the checkout.session.completed path.

alter table public.patrons add column if not exists stripe_invoice_id text;

create unique index if not exists patrons_stripe_invoice_id_key
  on public.patrons (stripe_invoice_id)
  where stripe_invoice_id is not null;
