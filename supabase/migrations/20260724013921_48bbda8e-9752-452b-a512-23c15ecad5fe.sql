-- 1) business_accounts: add WITH CHECK to restrictive tenant_scope policy
DROP POLICY IF EXISTS "tenant_scope" ON public.business_accounts;
CREATE POLICY "tenant_scope" ON public.business_accounts
  AS RESTRICTIVE
  FOR ALL
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR ((company_id IS NOT NULL) AND (company_id = private.current_company_id()))
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR ((company_id IS NOT NULL) AND (company_id = private.current_company_id()))
  );

-- 2) dealer_tier_status: remove broad sales-role read across all users
DROP POLICY IF EXISTS "Users view own tier status" ON public.dealer_tier_status;
CREATE POLICY "Users view own tier status" ON public.dealer_tier_status
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  );
