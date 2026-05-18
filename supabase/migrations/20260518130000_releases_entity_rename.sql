/*
  Releases entity refactor.

  Renames `albums` to `releases` and reshapes the format model so that a
  release has two independent dimensions:
    release_type:   album | ep | single | compilation
    release_format: digital | physical

  Replaces the old combined `release_formats` lookup table (which conflated
  the two dimensions into a single label) and the `albums.format_id` FK.

  Cascades:
    album_songs                -> release_songs               (album_id -> release_id)
    album_visibility_sections  -> release_visibility_sections (album_id -> release_id)
    album_visibility_messages  -> release_visibility_messages (album_id -> release_id)
    eras.album_id              -> eras.release_id
    purchases.item_type 'album' -> 'release'
    homepage_hero.entity_type 'album' -> 'release'

  Also renames indexes, triggers, RLS policies, and the status CHECK
  constraint for clarity. Recreates the audience refresh_audience_tags
  function with the new 'release' item_type literal.
*/

ALTER TABLE albums ADD COLUMN release_type text;
ALTER TABLE albums ADD COLUMN release_format text NOT NULL DEFAULT 'digital';

UPDATE albums SET release_type = CASE rf.slug
  WHEN 'digital-album' THEN 'album'
  WHEN 'digital-ep' THEN 'ep'
  WHEN 'digital-single' THEN 'single'
  WHEN 'digital-compilation' THEN 'compilation'
  ELSE 'album'
END
FROM release_formats rf
WHERE albums.format_id = rf.id;

UPDATE albums SET release_type = 'album' WHERE release_type IS NULL;

ALTER TABLE albums ALTER COLUMN release_type SET NOT NULL;
ALTER TABLE albums ADD CONSTRAINT albums_release_type_check
  CHECK (release_type IN ('album', 'ep', 'single', 'compilation'));
ALTER TABLE albums ADD CONSTRAINT albums_release_format_check
  CHECK (release_format IN ('digital', 'physical'));

ALTER TABLE albums DROP COLUMN format_id;

DROP TABLE release_formats;

ALTER TABLE albums RENAME TO releases;
ALTER TABLE album_songs RENAME TO release_songs;
ALTER TABLE album_visibility_sections RENAME TO release_visibility_sections;
ALTER TABLE album_visibility_messages RENAME TO release_visibility_messages;

ALTER TABLE release_songs RENAME COLUMN album_id TO release_id;
ALTER TABLE release_visibility_sections RENAME COLUMN album_id TO release_id;
ALTER TABLE release_visibility_messages RENAME COLUMN album_id TO release_id;
ALTER TABLE eras RENAME COLUMN album_id TO release_id;

ALTER INDEX IF EXISTS idx_albums_slug RENAME TO idx_releases_slug;
ALTER INDEX IF EXISTS idx_albums_status RENAME TO idx_releases_status;
ALTER INDEX IF EXISTS idx_eras_album RENAME TO idx_eras_release;
ALTER INDEX IF EXISTS idx_album_vis_sections_album RENAME TO idx_release_vis_sections_release;
ALTER INDEX IF EXISTS idx_album_vis_sections_status RENAME TO idx_release_vis_sections_status;
ALTER INDEX IF EXISTS idx_album_vis_messages_album_time RENAME TO idx_release_vis_messages_release_time;

ALTER TRIGGER albums_updated_at ON releases RENAME TO releases_updated_at;
ALTER TRIGGER album_vis_sections_updated_at ON release_visibility_sections RENAME TO release_vis_sections_updated_at;

ALTER TABLE releases RENAME CONSTRAINT albums_status_check TO releases_status_check;
ALTER TABLE releases RENAME CONSTRAINT albums_release_type_check TO releases_release_type_check;
ALTER TABLE releases RENAME CONSTRAINT albums_release_format_check TO releases_release_format_check;

DROP POLICY IF EXISTS "Public can read published albums" ON releases;
DROP POLICY IF EXISTS "Admin full access albums" ON releases;
CREATE POLICY "Public can read published releases" ON releases FOR SELECT USING (status = 'published');
CREATE POLICY "Admin full access releases" ON releases FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Public can read published album visibility sections" ON release_visibility_sections;
DROP POLICY IF EXISTS "Admin full access album visibility sections" ON release_visibility_sections;
CREATE POLICY "Public can read published release visibility sections"
  ON release_visibility_sections FOR SELECT USING (status = 'published');
CREATE POLICY "Admin full access release visibility sections"
  ON release_visibility_sections FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin full access album visibility messages" ON release_visibility_messages;
CREATE POLICY "Admin full access release visibility messages"
  ON release_visibility_messages FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "album_songs_public_read" ON release_songs;
DROP POLICY IF EXISTS "album_songs_admin_all" ON release_songs;
CREATE POLICY "release_songs_public_read" ON release_songs FOR SELECT USING (true);
CREATE POLICY "release_songs_admin_all" ON release_songs FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_item_type_check;
UPDATE purchases SET item_type = 'release' WHERE item_type = 'album';
ALTER TABLE purchases ADD CONSTRAINT purchases_item_type_check
  CHECK (item_type IN ('song', 'release', 'merch', 'ringtone', 'art_original'));

DO $homepage_hero_block$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'homepage_hero') THEN
    ALTER TABLE homepage_hero DROP CONSTRAINT IF EXISTS homepage_hero_entity_type_check;
    UPDATE homepage_hero SET entity_type = 'release' WHERE entity_type = 'album';
    ALTER TABLE homepage_hero ADD CONSTRAINT homepage_hero_entity_type_check
      CHECK (entity_type IN ('song', 'release', 'merch', 'observation', 'art'));
  END IF;
END $homepage_hero_block$;

CREATE OR REPLACE FUNCTION public.refresh_audience_tags(p_audience_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  a record;
  v_score text;
BEGIN
  SELECT * INTO a FROM public.audience WHERE id = p_audience_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_score := public.compute_engagement_score(p_audience_id);
  UPDATE public.audience SET engagement_score = v_score, updated_at = now()
    WHERE id = p_audience_id;

  DELETE FROM public.audience_tags
    WHERE audience_id = p_audience_id
      AND tag IN (
        'customer','customer:recent','customer:past',
        'buyer:digital','buyer:physical','buyer:repeat',
        'subscriber:active','subscriber:past',
        'engaged:high','engaged:medium','engaged:low','engaged:inactive'
      );

  IF a.lifetime_orders > 0 THEN
    INSERT INTO public.audience_tags (audience_id, tag) VALUES (p_audience_id, 'customer');
    IF a.last_purchase_at IS NOT NULL AND a.last_purchase_at > now() - interval '90 days' THEN
      INSERT INTO public.audience_tags VALUES (p_audience_id, 'customer:recent', now());
    ELSE
      INSERT INTO public.audience_tags VALUES (p_audience_id, 'customer:past', now());
    END IF;
    IF a.lifetime_orders >= 2 THEN
      INSERT INTO public.audience_tags VALUES (p_audience_id, 'buyer:repeat', now());
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.purchases p
      WHERE p.audience_id = p_audience_id
        AND p.item_type IN ('song','release','ringtone','track')
    ) THEN
      INSERT INTO public.audience_tags VALUES (p_audience_id, 'buyer:digital', now());
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.purchases p
      WHERE p.audience_id = p_audience_id
        AND p.item_type IN ('merch','art_original')
    ) THEN
      INSERT INTO public.audience_tags VALUES (p_audience_id, 'buyer:physical', now());
    END IF;
  END IF;

  IF a.subscriber_status = 'active' THEN
    INSERT INTO public.audience_tags VALUES (p_audience_id, 'subscriber:active', now());
  ELSIF a.subscriber_status = 'unsubscribed' THEN
    INSERT INTO public.audience_tags VALUES (p_audience_id, 'subscriber:past', now());
  END IF;

  INSERT INTO public.audience_tags VALUES (p_audience_id, 'engaged:' || v_score, now())
    ON CONFLICT DO NOTHING;
END $$;
