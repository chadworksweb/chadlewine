-- Split display_name into structured first/last name master fields.
-- These are the source of truth going forward — display_name stays for
-- legacy reads but new writes populate first_name + last_name.

alter table public.audience
  add column if not exists first_name text,
  add column if not exists last_name text;

-- Backfill from existing display_name: split on the first space.
-- Single-name rows (no space) keep everything as first_name.
update public.audience
set
  first_name = trim(split_part(display_name, ' ', 1)),
  last_name = nullif(
    trim(substring(display_name from position(' ' in display_name) + 1)),
    ''
  )
where display_name is not null
  and trim(display_name) <> ''
  and first_name is null;
