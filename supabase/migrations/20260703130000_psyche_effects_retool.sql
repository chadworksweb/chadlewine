-- Psyche Effects taxonomy retool (authoring feedback):
--  * "steels your refusal" -> "strengthens fortitude"
--  * "numbs you" was too broad -- it mislabeled desire (sex) and celebration
--    (party) as sedation. Dropped and split into two truer effects:
--      - "glorifies the escape" (shadow): songs that romanticize the high / the
--        night as the answer (Fly, Grab A Pack, Life is a Ride, 'Til I Pop).
--      - "commiserates" (seekable): songs that keep you company in the pain and
--        show the trap without selling it.

UPDATE psyche_effects
  SET label = 'strengthens fortitude', slug = 'strengthens-fortitude'
  WHERE slug = 'steels-your-refusal';

-- New seekable effect (commiseration), slotted after the 15 seekable ones.
INSERT INTO psyche_effects (label, slug, shadow, sort_order) VALUES
  ('commiserates', 'commiserates', false, 16);

-- Renumber the shadow group and add the escape effect.
UPDATE psyche_effects SET sort_order = 17 WHERE slug = 'feeds-the-ego';
INSERT INTO psyche_effects (label, slug, shadow, sort_order) VALUES
  ('glorifies the escape', 'glorifies-the-escape', true, 18);
UPDATE psyche_effects SET sort_order = 19 WHERE slug = 'sinks-into-despair';
UPDATE psyche_effects SET sort_order = 20 WHERE slug = 'keeps-you-in-longing';

-- Drop the overbroad tag (FK cascade removes its junction rows).
DELETE FROM psyche_effects WHERE slug = 'numbs-you';
