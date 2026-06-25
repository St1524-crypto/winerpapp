-- Storefront anon read access. Policies already restrict anon to status='active'
-- (products) and session-token-scoped rows (carts/cart_items). Grants were
-- missing, causing 401 "permission denied for table products" on /shop.
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.carts TO anon;
GRANT INSERT, UPDATE, DELETE ON public.carts TO anon;
GRANT SELECT ON public.cart_items TO anon;
GRANT INSERT, UPDATE, DELETE ON public.cart_items TO anon;
