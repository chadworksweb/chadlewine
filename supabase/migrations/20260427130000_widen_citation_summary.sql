-- The 300-char cap on songs.citation_summary was too tight for AI-generated
-- 40-60 word summaries — Claude regularly produces output that overflows.
-- Widen to text. observations.citation_summary already has a soft check via
-- trigger, so widening songs only is sufficient here.

ALTER TABLE songs ALTER COLUMN citation_summary TYPE text;
