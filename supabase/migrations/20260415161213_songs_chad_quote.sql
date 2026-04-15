alter table public.songs add column if not exists chad_quote text;

notify pgrst, 'reload schema';
