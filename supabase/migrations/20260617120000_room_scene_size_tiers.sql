-- Room scene size tiers: a piece should only see rooms that flatter its size.
-- Adds wall_min_width_in (pairs with the existing wall_max_width_in). RoomView keeps a
-- scene only when the piece width falls inside [wall_min_width_in, wall_max_width_in];
-- a NULL bound is open on that side. Small pieces land in intimate situations, large
-- pieces on statement walls. The scale math is unchanged; this only curates which
-- scenes appear.

ALTER TABLE room_scenes
  ADD COLUMN wall_min_width_in numeric(7,2);

COMMENT ON COLUMN room_scenes.wall_min_width_in IS 'Smallest piece width (in) this scene flatters. Pairs with wall_max_width_in; RoomView shows a scene only when piece width is within [min, max]. NULL = open on the low side.';

-- Tier the five existing scenes.
--   intimate situations    : the three rows seeded below (small pieces)
--   standard rooms         : warm-living-room, minimalist-loft, moody-study
--   statement walls        : bushwick-artist-loft (the warehouse)
-- entryway-hallway read wrong for a small 16x20, so its low bound is raised to exclude
-- small pieces and its wall narrowed.
UPDATE room_scenes SET wall_min_width_in = 12 WHERE slug = 'warm-living-room';
UPDATE room_scenes SET wall_min_width_in = 22 WHERE slug = 'minimalist-loft';
UPDATE room_scenes SET wall_min_width_in = 36 WHERE slug = 'bushwick-artist-loft';
UPDATE room_scenes SET wall_min_width_in = 28, wall_max_width_in = 60 WHERE slug = 'entryway-hallway';
UPDATE room_scenes SET wall_min_width_in = 10 WHERE slug = 'moody-study';

-- Scaffold three intimate situations for small pieces. They stay is_active = false with
-- NULL image_path/px_per_inch until their backplates are generated (same batch recipe),
-- uploaded via scripts/upload-room-scenes.ts, then calibrated and activated through a
-- service-role UPDATE (never a pasted INSERT -- long URLs wrap and inject CRLF).
INSERT INTO room_scenes
  (slug, name, anchor_x_pct, anchor_y_pct, wall_min_width_in, wall_max_width_in, display_order, is_active)
VALUES
  ('bedside-nightstand', 'Above a nightstand', 50, 38, NULL, 24, 6, false),
  ('desk-workspace',     'Desk workspace',     50, 38, NULL, 22, 7, false),
  ('leaning-shelf',      'Leaning ledge',      50, 40, NULL, 30, 8, false);
