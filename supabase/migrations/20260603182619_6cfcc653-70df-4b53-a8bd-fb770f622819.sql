
-- 1) Coupons: drop overly broad "Authenticated view active coupons"
DROP POLICY IF EXISTS "Authenticated view active coupons" ON public.coupons;
CREATE POLICY "Staff view coupons"
  ON public.coupons FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
  );

-- 2) Internal bonus / rebate / dealer configuration tables
DROP POLICY IF EXISTS "Authenticated read bonus_settings" ON public.bonus_settings;
DROP POLICY IF EXISTS "Authenticated view bonus_settings" ON public.bonus_settings;
CREATE POLICY "Staff view bonus_settings"
  ON public.bonus_settings FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  );

DROP POLICY IF EXISTS "Authenticated read repurchase_bonus_settings" ON public.repurchase_bonus_settings;
DROP POLICY IF EXISTS "Authenticated view repurchase_bonus_settings" ON public.repurchase_bonus_settings;
CREATE POLICY "Staff view repurchase_bonus_settings"
  ON public.repurchase_bonus_settings FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  );

DROP POLICY IF EXISTS "Authenticated read rank_rebate_settings" ON public.rank_rebate_settings;
DROP POLICY IF EXISTS "Authenticated view rank_rebate_settings" ON public.rank_rebate_settings;
CREATE POLICY "Staff view rank_rebate_settings"
  ON public.rank_rebate_settings FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  );

DROP POLICY IF EXISTS "Authenticated read monthly_tier_bonus_settings" ON public.monthly_tier_bonus_settings;
DROP POLICY IF EXISTS "Authenticated view monthly_tier_bonus_settings" ON public.monthly_tier_bonus_settings;
CREATE POLICY "Staff view monthly_tier_bonus_settings"
  ON public.monthly_tier_bonus_settings FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  );

DROP POLICY IF EXISTS "Authenticated read dealer_tiers" ON public.dealer_tiers;
DROP POLICY IF EXISTS "Authenticated view dealer_tiers" ON public.dealer_tiers;
CREATE POLICY "Staff view dealer_tiers"
  ON public.dealer_tiers FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  );

DROP POLICY IF EXISTS "Authenticated read dealer_program_settings" ON public.dealer_program_settings;
DROP POLICY IF EXISTS "Authenticated view dealer_program_settings" ON public.dealer_program_settings;
CREATE POLICY "Staff view dealer_program_settings"
  ON public.dealer_program_settings FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  );

-- 3) price_tiers
DROP POLICY IF EXISTS "Auth view price_tiers" ON public.price_tiers;
CREATE POLICY "Staff view price_tiers"
  ON public.price_tiers FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
  );

-- 4) product_wholesale_tiers — staff or business-account member
DROP POLICY IF EXISTS "Authenticated view wholesale tiers" ON public.product_wholesale_tiers;
CREATE POLICY "Staff or business members view wholesale tiers"
  ON public.product_wholesale_tiers FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.business_account_users bau
      WHERE bau.user_id = auth.uid()
    )
  );

-- 5) sales_representatives — restrict commission visibility to staff
DROP POLICY IF EXISTS "Auth view sales_reps" ON public.sales_representatives;
CREATE POLICY "Staff view sales_reps"
  ON public.sales_representatives FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
  );
