
-- Restrict direct SELECT on products.cost_price / products.wholesale_price to service_role only.
-- Public / authenticated users must go through SECURITY DEFINER RPCs:
--   get_product_costs (staff/admin)
--   get_product_wholesale_prices (VIP/dealer/staff)
-- Idempotent: safe to re-run.

REVOKE SELECT ON public.products FROM anon;
REVOKE SELECT ON public.products FROM authenticated;

GRANT SELECT (
  id, sku, name, category, price, stock, image, created_at,
  short_description, description, category_id, safe_stock, status,
  featured, updated_at, company_id, reward_points, discount_points_max,
  specs, display_priority, wholesale_only
) ON public.products TO anon;

GRANT SELECT (
  id, sku, name, category, price, stock, image, created_at,
  short_description, description, category_id, safe_stock, status,
  featured, updated_at, company_id, reward_points, discount_points_max,
  specs, display_priority, wholesale_only
) ON public.products TO authenticated;

-- Preserve existing write privileges for authenticated (RLS still enforces per-row rules)
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
