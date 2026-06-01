-- Add the PA-plan branch and cover-song suggestions to booking inquiries.
-- pa_plan: how sound is handled -- one of onsite | rent | split (validated in
-- the /api/book route). "split" means Chad shares the PA rental, which gates
-- the exchange options. covers: array of cover-song titles the host suggested.

alter table public.booking_inquiries
  add column if not exists pa_plan text,
  add column if not exists covers jsonb not null default '[]'::jsonb;
