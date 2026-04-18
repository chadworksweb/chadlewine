-- Song art focal point for ratio-cropped hero rendering.
-- Hero displays song art at 1200:630 aspect (see global.css .cover-hero__art-wrap).
-- When the source image has a different aspect ratio, it is cover-cropped;
-- the focal point determines which part of the source stays visible.
-- Stored as percentages (0-100). NULL = center (50/50).

alter table songs add column art_focal_x numeric(5,2);
alter table songs add column art_focal_y numeric(5,2);

alter table songs add constraint songs_art_focal_x_range
  check (art_focal_x is null or (art_focal_x >= 0 and art_focal_x <= 100));
alter table songs add constraint songs_art_focal_y_range
  check (art_focal_y is null or (art_focal_y >= 0 and art_focal_y <= 100));
