-- Projector + screen availability for booking inquiries. The Super Individual
-- Night uses visuals (a music video and a live Rising Compass reading), so the
-- form asks whether the room has a projector and a screen.

alter table public.booking_inquiries
  add column if not exists has_projector boolean,
  add column if not exists has_screen boolean;
