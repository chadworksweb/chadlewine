-- Art "View In A Room" (our custom in-situ).
-- Two parts:
--   1. art_pieces gains structured real-world size (width_in / height_in / depth_in).
--      The existing free-text `dimensions` column stays for display + JSON-LD; these
--      numerics are what the scale math reads. RoomView renders ONLY when width_in
--      and height_in are both set, so it never lies about size.
--   2. room_scenes: a curated set of calibrated empty-room backplates. The artwork is
--      composited onto a scene by deterministic CSS at art_width_in * px_per_inch, so
--      the model that generated the room never touches the art. Scenes are global
--      config; the only per-piece input is width/height.
--
-- Seeded scenes start is_active = false (image_path + calibration are NULL until the
-- backplate is uploaded to Bunny and px_per_inch / anchor are measured). A follow-up
-- migration (or the Phase 2 room-scenes admin) fills those and flips is_active = true.

-- ===== art_pieces: structured dimensions =====
ALTER TABLE art_pieces
  ADD COLUMN width_in  numeric(7,2),
  ADD COLUMN height_in numeric(7,2),
  ADD COLUMN depth_in  numeric(7,2);

COMMENT ON COLUMN art_pieces.width_in  IS 'Real artwork width in inches. RoomView scale source. Display dims stay in `dimensions`.';
COMMENT ON COLUMN art_pieces.height_in IS 'Real artwork height in inches. RoomView renders only when width_in and height_in are both set.';
COMMENT ON COLUMN art_pieces.depth_in  IS 'Optional frame/canvas depth in inches; feeds the in-room edge shadow.';

-- ===== room_scenes =====
-- px_per_inch is measured at this image_path''s NATIVE pixel width, against a known
-- in-frame object (a standard interior door ~80in, or a wall switch/outlet plate on
-- the same plane the art hangs on). RoomView rescales by renderedWidth / naturalWidth
-- so the inch math holds at any viewport. anchor_*_pct place the artwork CENTER as a
-- percent of image width/height (encodes gallery hang height + horizontal placement).
CREATE TABLE room_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  image_path text,
  px_per_inch numeric(8,4),
  anchor_x_pct numeric(5,2) NOT NULL DEFAULT 50,
  anchor_y_pct numeric(5,2) NOT NULL DEFAULT 42,
  wall_max_width_in numeric(7,2),
  light_warmth text,
  shadow_blur integer,
  shadow_offset integer,
  perspective jsonb,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_room_scenes_active ON room_scenes(is_active, display_order);

ALTER TABLE room_scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active room scenes"
  ON room_scenes FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admin full access room_scenes"
  ON room_scenes FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT ON room_scenes TO anon;
GRANT ALL    ON room_scenes TO authenticated, service_role;

CREATE TRIGGER room_scenes_updated_at BEFORE UPDATE ON room_scenes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed the five curated scenes, fully calibrated and active. Backplates are 1200px
-- wide, so px_per_inch = 1200 / (inches the photo spans at the wall plane). These are
-- first-pass estimates from room size; fine-tune with UPDATEs against a real piece.
-- Nothing renders publicly until an art piece has numeric width_in/height_in set.
INSERT INTO room_scenes
  (slug, name, image_path, px_per_inch, anchor_x_pct, anchor_y_pct, wall_max_width_in, display_order, is_active)
VALUES
  ('warm-living-room',     'Warm living room',     'https://chadlewine-site-images.b-cdn.net/room-scenes/view-in-a-room-warm-living-room.png',      6.5, 41, 40,  80, 1, true),
  ('minimalist-loft',      'Minimalist loft',      'https://chadlewine-site-images.b-cdn.net/room-scenes/view-in-a-room-minimalist-loft.png',       6.0, 44, 41, 100, 2, true),
  ('bushwick-artist-loft', 'Bushwick artist loft', 'https://chadlewine-site-images.b-cdn.net/room-scenes/view-in-a-room-bushwick-artist-loft.png',  5.0, 40, 45, 130, 3, true),
  ('entryway-hallway',     'Entryway hallway',     'https://chadlewine-site-images.b-cdn.net/room-scenes/view-in-a-room-entryway-hallway.png',     11.0, 60, 41,  44, 4, true),
  ('moody-study',          'Moody study',          'https://chadlewine-site-images.b-cdn.net/room-scenes/view-in-a-room-moody-study.png',           9.5, 37, 41,  64, 5, true);
