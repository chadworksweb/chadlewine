-- "merch" = physical products specifically (music and art are products too, so
-- the generic table name "products" was misleading). Rename products -> merch.
--
-- Zero-downtime cutover: a backward-compat "products" view keeps not-yet-deployed
-- code (.from("products")) working. security_invoker = true so the view honors
-- merch's RLS (anon still only sees active rows). After the new code deploys,
-- drop the view and repoint the product_images RLS subquery / collection FK.

ALTER TABLE products RENAME TO merch;

CREATE VIEW products WITH (security_invoker = true) AS SELECT * FROM merch;
GRANT SELECT ON products TO anon;
GRANT ALL    ON products TO authenticated, service_role;

-- Decouple the editions RPC from the compat view so it can be dropped later.
CREATE OR REPLACE FUNCTION increment_editions_sold(p_product_id uuid)
RETURNS integer
LANGUAGE sql
AS $$
  UPDATE merch
  SET editions_sold = editions_sold + 1
  WHERE id = p_product_id
  RETURNING editions_sold;
$$;
