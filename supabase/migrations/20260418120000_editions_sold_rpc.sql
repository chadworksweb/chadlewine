CREATE OR REPLACE FUNCTION increment_editions_sold(p_product_id uuid)
RETURNS integer
LANGUAGE sql
AS $$
  UPDATE products
  SET editions_sold = editions_sold + 1
  WHERE id = p_product_id
  RETURNING editions_sold;
$$;

REVOKE ALL ON FUNCTION increment_editions_sold(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_editions_sold(uuid) TO service_role;
