-- Persist the full Printify image gallery on products. The single image_url
-- column stays for the card thumbnail / OG image; image_urls holds all images
-- (front, back, color variants, etc.) so the detail page can render a gallery.
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';
