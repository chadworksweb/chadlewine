-- Allow merch and diddy item types in purchases
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_item_type_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_item_type_check CHECK (item_type IN ('song', 'album', 'merch', 'diddy'));
