-- Full-res art paths (private bucket: art-fullres)
ALTER TABLE observations ADD COLUMN IF NOT EXISTS art_fullres_print_path text;
ALTER TABLE observations ADD COLUMN IF NOT EXISTS art_fullres_wallpaper_path text;

COMMENT ON COLUMN observations.art_fullres_print_path IS 'Path in art-fullres bucket — full-res for Printify print (PNG, 4494x5097+)';
COMMENT ON COLUMN observations.art_fullres_wallpaper_path IS 'Path in art-fullres bucket — wallpaper-res for subscriber downloads (webp, 2560x1440+)';
