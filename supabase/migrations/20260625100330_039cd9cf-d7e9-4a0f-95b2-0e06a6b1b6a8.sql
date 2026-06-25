
-- A. Products: column-level restrictions
REVOKE SELECT ON public.products FROM anon;
REVOKE SELECT ON public.products FROM authenticated;

GRANT SELECT (
  id, sku, name, category, price, stock, image, created_at,
  short_description, description, category_id, safe_stock, status,
  featured, updated_at, company_id, reward_points, discount_points_max, specs
) ON public.products TO anon;

GRANT SELECT (
  id, sku, name, category, price, stock, image, created_at,
  short_description, description, category_id, wholesale_price, safe_stock, status,
  featured, updated_at, company_id, reward_points, discount_points_max, specs
) ON public.products TO authenticated;

-- service_role retains full access (already has ALL via default grants on this project).
GRANT ALL ON public.products TO service_role;

-- B. Login attempts: remove member self-read (admin client server fn handles "my attempts")
DROP POLICY IF EXISTS "Users view own login attempts" ON public.login_attempts;

-- C. VIP bonus pools: remove broad authenticated read (internal config)
DROP POLICY IF EXISTS "authenticated read active vip_bonus_pools" ON public.vip_bonus_pools;
