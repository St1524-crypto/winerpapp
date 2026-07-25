
-- 1) referral_logs: enforce non-null company_id + drop NULL bypass
ALTER TABLE public.referral_logs ALTER COLUMN company_id SET DEFAULT private.current_company_id();
UPDATE public.referral_logs SET company_id = private.current_company_id() WHERE company_id IS NULL AND private.current_company_id() IS NOT NULL;
ALTER TABLE public.referral_logs ALTER COLUMN company_id SET NOT NULL;

DROP POLICY IF EXISTS "referral_logs tenant_scope restrictive" ON public.referral_logs;
CREATE POLICY "referral_logs tenant_scope restrictive"
  ON public.referral_logs
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR company_id = private.current_company_id()
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR company_id = private.current_company_id()
  );

-- 2) vip_upgrade_orders: validate self-insert against real vip_upgrade_packages
DROP POLICY IF EXISTS "vip_orders self insert pending" ON public.vip_upgrade_orders;
CREATE POLICY "vip_orders self insert pending"
  ON public.vip_upgrade_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND payment_status = 'pending'
    AND paid_at IS NULL
    AND applied_at IS NULL
    AND new_tier IS NULL
    AND sales_order_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.vip_upgrade_packages p
      WHERE p.id = vip_upgrade_orders.package_id
        AND p.tier_code = vip_upgrade_orders.tier_code
        AND p.price = vip_upgrade_orders.amount
        AND p.status = 'active'
    )
  );

-- 3) webhook_endpoints: revoke column-level access to bearer_token from authenticated
REVOKE SELECT (bearer_token) ON public.webhook_endpoints FROM authenticated;
REVOKE UPDATE (bearer_token) ON public.webhook_endpoints FROM authenticated;
-- service_role retains full access via GRANT ALL; server functions will read/rotate via admin client.
