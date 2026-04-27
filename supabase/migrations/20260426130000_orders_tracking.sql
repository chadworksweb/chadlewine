-- Order tracking system: orders header + purchases linkage + Printify fields.

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1000;

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT ('CL-' || nextval('order_number_seq')),

  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN (
    'pending_review',
    'approved',
    'in_production',
    'shipped',
    'delivered',
    'completed',
    'cancelled',
    'refunded'
  )),
  buyer_email text NOT NULL,
  buyer_name text,
  ship_line1 text,
  ship_line2 text,
  ship_city text,
  ship_state text,
  ship_zip text,
  ship_country text,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  shipping numeric(10,2) NOT NULL DEFAULT 0,
  tax numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text,
  printify_order_id text,
  tracking_number text,
  tracking_url text,
  carrier text,
  has_printify_lines boolean NOT NULL DEFAULT false,
  has_digital_lines boolean NOT NULL DEFAULT false,
  reviewed_at timestamptz,
  reviewed_by uuid,
  pushed_to_printify_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  refunded_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_email ON orders(buyer_email);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_stripe_session ON orders(stripe_session_id);
CREATE INDEX idx_orders_printify ON orders(printify_order_id);

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access orders" ON orders FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS unit_price numeric(10,2);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS line_total numeric(10,2);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS title_snapshot text;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS product_config_snapshot jsonb;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS printify_line_item_id text;

ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_item_type_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_item_type_check
  CHECK (item_type IN ('song', 'album', 'merch', 'ringtone', 'art_original'));

CREATE INDEX IF NOT EXISTS idx_purchases_order ON purchases(order_id);
