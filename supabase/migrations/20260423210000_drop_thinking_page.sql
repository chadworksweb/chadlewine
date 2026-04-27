-- /thinking page is retired (consultancy dropped — music/art/shirts/shows only).
-- Remove stale feature_flag row and any page_meta row pointing at the dead route.

delete from public.feature_flags where section = 'thinking';
delete from public.page_meta where route = '/thinking';
