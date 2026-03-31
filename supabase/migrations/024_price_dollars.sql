-- Convert pricing from cents (integer) to dollars (numeric)
-- Songs: rename price_cents → price, convert values
-- Albums: add price column
-- Purchases: rename amount_cents → amount, update item_type check

-- Songs: add price column, migrate data, drop old
ALTER TABLE songs ADD COLUMN price numeric(10,2);
UPDATE songs SET price = price_cents / 100.0 WHERE price_cents IS NOT NULL;
ALTER TABLE songs DROP COLUMN price_cents;

-- Albums: add price
ALTER TABLE albums ADD COLUMN price numeric(10,2);

-- Purchases: add amount, migrate, drop old, fix check
ALTER TABLE purchases ADD COLUMN amount numeric(10,2);
UPDATE purchases SET amount = amount_cents / 100.0 WHERE amount_cents IS NOT NULL;
ALTER TABLE purchases DROP COLUMN amount_cents;
ALTER TABLE purchases DROP CONSTRAINT purchases_item_type_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_item_type_check CHECK (item_type IN ('song', 'album'));

-- Patrons: add amount, migrate, drop old
ALTER TABLE patrons ADD COLUMN amount numeric(10,2);
UPDATE patrons SET amount = amount_cents / 100.0 WHERE amount_cents IS NOT NULL;
ALTER TABLE patrons DROP COLUMN amount_cents;

-- Products: rename price_cents → price
ALTER TABLE products ADD COLUMN price numeric(10,2);
UPDATE products SET price = price_cents / 100.0 WHERE price_cents IS NOT NULL;
ALTER TABLE products DROP COLUMN price_cents;
