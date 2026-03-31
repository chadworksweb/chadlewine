-- Track enrichment: add release_date, song_summary, ISRC
ALTER TABLE tracks ADD COLUMN release_date date;
ALTER TABLE tracks ADD COLUMN song_summary text;
ALTER TABLE tracks ADD COLUMN isrc text;
