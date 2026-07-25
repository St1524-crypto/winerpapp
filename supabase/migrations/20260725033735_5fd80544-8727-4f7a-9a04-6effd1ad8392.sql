-- Scope sales role out of company-wide sensitive reads

-- cash_transactions: remove sales from SELECT
DROP POLICY IF EXISTS "Users view own cash tx" ON public.cash_transactions;
CREATE POLICY "Users view own cash tx"
  ON public.cash_transactions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

-- referral_logs: remove sales from full ALL access; keep admin/super_admin only
DROP POLICY IF EXISTS "Admin manage referral logs" ON public.referral_logs;
CREATE POLICY "Admin manage referral logs"
  ON public.referral_logs
  FOR ALL
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

-- Sales can view referral logs they directly own as referrer
CREATE POLICY "Sales view own referral logs"
  ON public.referral_logs
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'sales'::app_role)
    AND referrer_id = auth.uid()
    AND company_id = private.current_company_id()
  );
