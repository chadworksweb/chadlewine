INSERT INTO related_entities (source_type, source_id, entity_type, entity_id, display_order)
SELECT 'song', song_id, 'art', art_id, position FROM songs_featured_art
ON CONFLICT (source_type, source_id, entity_type, entity_id) DO NOTHING;

INSERT INTO related_entities (source_type, source_id, entity_type, entity_id, display_order)
SELECT 'art', art_id, 'song', song_id, position FROM art_featured_songs
ON CONFLICT (source_type, source_id, entity_type, entity_id) DO NOTHING;

INSERT INTO related_entities (source_type, source_id, entity_type, entity_id, display_order)
SELECT 'art', parent_art_id, 'art', related_art_id, position FROM art_featured_art
ON CONFLICT (source_type, source_id, entity_type, entity_id) DO NOTHING;
