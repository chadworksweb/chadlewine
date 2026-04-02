-- Add fulfillment type to products (manual / printify_curated / printify_configurator)
ALTER TABLE products ADD COLUMN IF NOT EXISTS fulfillment text NOT NULL DEFAULT 'printify_curated';
-- Add image fields for manual products (no Printify mockup)
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_alt text;

COMMENT ON COLUMN products.fulfillment IS 'manual = Chad buys/prints/ships. printify_curated = Chad designs in Printify. printify_configurator = customer picks content via configurator.';
COMMENT ON COLUMN products.image_url IS 'Product image URL (manual products). Printify products get mockups from API.';
