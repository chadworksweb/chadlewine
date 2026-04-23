ALTER TABLE art_pieces ADD COLUMN licensing_direct_answer text;
ALTER TABLE art_pieces ADD COLUMN licensing_content text;
ALTER TABLE art_pieces ADD COLUMN licensing_key_points text[] DEFAULT '{}';
