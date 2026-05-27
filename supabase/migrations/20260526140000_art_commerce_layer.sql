-- Art commerce layer.
-- Gives art_pieces the same atomic, dedicated-SKU treatment songs and releases
-- already have. Before this, art was sold by hand-linking merch products. Now
-- each piece owns its commerce:
--   art_skus       -- the 1-of-1 original and signed/numbered limited prints
--   sku_variants   -- framing options etc. (parent XOR extended to art_sku_id)
--   art_inquiries  -- concierge "inquire / reserve" inbox for high-ticket pieces
-- sale_mode is set per SKU by the admin (buy_now or inquire); no global price
-- threshold. Both original and limited_print default to buy_now.
--
-- Shipping columns mirror song_skus / release_skus exactly (US/CA/UK/ROW manual
-- rates + free_shipping_exempt) so the existing shipping calculator and admin
-- SKU UI work against art SKUs unchanged.

-- art_skus (parallel to song_skus / release_skus; art is a first-class peer)
CREATE TABLE art_skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  art_id uuid NOT NULL REFERENCES art_pieces(id) ON DELETE CASCADE,
  format text NOT NULL
    CHECK (format IN ('original', 'limited_print')),
  fulfillment_method text NOT NULL DEFAULT 'manual'
    CHECK (fulfillment_method IN ('manual', 'printify')),
  sale_mode text NOT NULL DEFAULT 'buy_now'
    CHECK (sale_mode IN ('buy_now', 'inquire')),
  sku_code text,
  price numeric(10,2),
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'sold', 'preorder', 'discontinued')),
  stock integer,
  edition_size  integer NOT NULL DEFAULT 0,
  editions_sold integer NOT NULL DEFAULT 0,
  coa_enabled boolean NOT NULL DEFAULT true,
  weight_grams  integer,
  ships_in_days integer,
  shipping_first_cents     integer,
  shipping_addl_cents      integer,
  shipping_ca_first_cents  integer,
  shipping_ca_addl_cents   integer,
  shipping_uk_first_cents  integer,
  shipping_uk_addl_cents   integer,
  shipping_row_first_cents integer,
  shipping_row_addl_cents  integer,
  free_shipping_exempt boolean NOT NULL DEFAULT false,
  printify_product_id text,
  printify_variant_id text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sku_code)
);

-- One original per piece. Limited prints are unconstrained (a piece may have
-- several editions, e.g. paper vs canvas).
CREATE UNIQUE INDEX idx_art_skus_one_original
  ON art_skus(art_id)
  WHERE format = 'original';

CREATE INDEX idx_art_skus_art    ON art_skus(art_id);
CREATE INDEX idx_art_skus_status ON art_skus(status);

ALTER TABLE art_skus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read sellable art_skus"
  ON art_skus FOR SELECT
  USING (status IN ('available', 'reserved', 'sold', 'preorder'));

CREATE POLICY "Admin full access art_skus"
  ON art_skus FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT ON art_skus TO anon;
GRANT ALL    ON art_skus TO authenticated, service_role;

CREATE TRIGGER art_skus_updated_at BEFORE UPDATE ON art_skus
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- sku_variants: extend the polymorphic parent to also cover art SKUs (framing,
-- substrate, etc.). Rebuild the XOR so exactly one parent is set.
ALTER TABLE sku_variants
  ADD COLUMN art_sku_id uuid REFERENCES art_skus(id) ON DELETE CASCADE;

ALTER TABLE sku_variants DROP CONSTRAINT sku_variants_parent_xor;
ALTER TABLE sku_variants ADD CONSTRAINT sku_variants_parent_xor CHECK (
  (release_sku_id IS NOT NULL)::int
  + (song_sku_id IS NOT NULL)::int
  + (art_sku_id IS NOT NULL)::int = 1
);

CREATE UNIQUE INDEX idx_sku_variants_art_slug
  ON sku_variants(art_sku_id, variant_slug)
  WHERE art_sku_id IS NOT NULL;

-- art_inquiries: concierge inbox for pieces sold via sale_mode = 'inquire'.
-- Inserted server-side by the inquiry API (service_role); admin reads via the
-- authenticated client like the SKU tables.
CREATE TABLE art_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  art_id     uuid REFERENCES art_pieces(id) ON DELETE SET NULL,
  art_sku_id uuid REFERENCES art_skus(id)   ON DELETE SET NULL,
  buyer_name  text NOT NULL,
  buyer_email text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'responded', 'reserved', 'won', 'lost', 'closed')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_art_inquiries_art     ON art_inquiries(art_id);
CREATE INDEX idx_art_inquiries_status  ON art_inquiries(status);
CREATE INDEX idx_art_inquiries_created ON art_inquiries(created_at DESC);

ALTER TABLE art_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access art_inquiries"
  ON art_inquiries FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT ALL ON art_inquiries TO authenticated, service_role;

CREATE TRIGGER art_inquiries_updated_at BEFORE UPDATE ON art_inquiries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- art_pieces: luxury presentation fields.
--   in_situ_paths -- to-scale / in-room shots that sell the original online.
ALTER TABLE art_pieces
  ADD COLUMN in_situ_paths text[] NOT NULL DEFAULT '{}';

-- purchases: wire art SKUs and add the limited-print line type.
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS art_sku_id uuid REFERENCES art_skus(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_art_sku ON purchases(art_sku_id);

ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_item_type_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_item_type_check
  CHECK (item_type IN ('song', 'release', 'merch', 'ringtone', 'art_original', 'art_limited_print'));
