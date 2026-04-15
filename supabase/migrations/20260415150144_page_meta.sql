-- Admin-editable meta for non-entity static pages.
-- Blank/NULL columns fall back to hardcoded defaults in generateMetadata.

create table if not exists public.page_meta (
  route text primary key,
  title text,
  description text,
  og_image_path text,
  updated_at timestamptz not null default now()
);

create trigger page_meta_updated_at
  before update on public.page_meta
  for each row
  execute function public.update_updated_at();

alter table public.page_meta enable row level security;

create policy "public read page_meta"
  on public.page_meta for select
  using (true);

notify pgrst, 'reload schema';
