-- Rename products.source_tldr_id → source_meditation_id
-- Migration 013 renamed the tldrs table to meditations but left FK columns on other tables unchanged

ALTER TABLE products RENAME COLUMN source_tldr_id TO source_meditation_id;
