-- Many-to-many Collections feature for products. Shopify-style.
-- A product can live in multiple collections. A collection is a curated set
-- of products, used by marketing-angle landing pages (e.g. /super-individual).

CREATE TABLE collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_collections_status ON collections(status);

CREATE TABLE collection_products (
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, product_id)
);

CREATE INDEX idx_collection_products_collection
  ON collection_products(collection_id, position);

CREATE INDEX idx_collection_products_product
  ON collection_products(product_id);

ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active collections"
  ON collections FOR SELECT
  USING (status = 'active');

CREATE POLICY "Admin full access collections"
  ON collections FOR ALL
  USING (auth.role() = 'authenticated');

CREATE POLICY "Public can read collection_products of active collections"
  ON collection_products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM collections c
      WHERE c.id = collection_products.collection_id AND c.status = 'active'
    )
  );

CREATE POLICY "Admin full access collection_products"
  ON collection_products FOR ALL
  USING (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION update_collections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER collections_updated_at
  BEFORE UPDATE ON collections
  FOR EACH ROW
  EXECUTE FUNCTION update_collections_updated_at();

-- Seed the Super Individual collection. Auto-populates from currently
-- active manual + printify_curated products (the 9 published merch items).
-- Admin can edit assignments after the fact.
INSERT INTO collections (slug, title, description, status, sort_order)
VALUES (
  'super-individual',
  'Super Individual',
  'The wearable thesis. Take back your power, starting with your soundtrack.',
  'active',
  0
);

INSERT INTO collection_products (collection_id, product_id, position)
SELECT
  (SELECT id FROM collections WHERE slug = 'super-individual'),
  p.id,
  ROW_NUMBER() OVER (ORDER BY p.created_at DESC) - 1
FROM products p
WHERE p.status = 'active'
  AND p.fulfillment IN ('manual', 'printify_curated');

-- Redirect /superindividual to the canonical path.
INSERT INTO redirects (from_path, to_path, status_code, source, active, notes)
VALUES (
  '/superindividual',
  '/super-individual',
  301,
  'manual',
  true,
  'Canonical landing page is /super-individual'
);
