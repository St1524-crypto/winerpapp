
DROP POLICY IF EXISTS "Anyone view active coupons" ON public.coupons;
CREATE POLICY "Authenticated view active coupons"
  ON public.coupons FOR SELECT
  TO authenticated
  USING (status = 'active');

DROP POLICY IF EXISTS "Anyone can view wholesale tiers" ON public.product_wholesale_tiers;
CREATE POLICY "Authenticated view wholesale tiers"
  ON public.product_wholesale_tiers FOR SELECT
  TO authenticated
  USING (true);

REVOKE SELECT ON public.coupons FROM anon;
REVOKE SELECT ON public.product_wholesale_tiers FROM anon;
