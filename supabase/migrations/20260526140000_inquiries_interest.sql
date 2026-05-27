-- Add the "what are you inquiring about" selection to inquiries. Nullable;
-- older rows and submissions without a selection stay null. Value is one of the
-- stable keys in src/lib/inquiry-interests.ts (validated in the API route).

alter table public.inquiries
  add column if not exists interest text;
