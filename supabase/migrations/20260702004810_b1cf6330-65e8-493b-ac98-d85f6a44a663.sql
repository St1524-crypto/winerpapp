
-- 1) vip_tiers: public-safe view (member-facing columns only)
CREATE OR REPLACE VIEW public.vip_tiers_public
WITH (security_invoker = on) AS
SELECT
  id,
  code,
  name,
  sort_order,
  status,
  required_reward_points,
  required_direct_vip,
  required_mentor_tier,
  required_mentor_count,
  renewal_window_days,
  renewal_required_new_vip,
  description
FROM public.vip_tiers
WHERE status = 'active';

GRANT SELECT ON public.vip_tiers_public TO anon, authenticated;

-- Remove broad public read from base table (exposed bonus rates & caps).
DROP POLICY IF EXISTS "vip_tiers public read active" ON public.vip_tiers;

-- 2) annual_fee_vip_rules: restrictive tenant-scope policy
DROP POLICY IF EXISTS annual_fee_rules_tenant_scope ON public.annual_fee_vip_rules;
CREATE POLICY annual_fee_rules_tenant_scope
  ON public.annual_fee_vip_rules
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    company_id IS NULL
    OR company_id = private.current_company_id()
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    company_id IS NULL
    OR company_id = private.current_company_id()
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 3) operation_task_reports: authenticated-only policies
DROP POLICY IF EXISTS ops_reports_self_insert ON public.operation_task_reports;
DROP POLICY IF EXISTS ops_reports_self_read ON public.operation_task_reports;
DROP POLICY IF EXISTS ops_reports_admin_all ON public.operation_task_reports;

CREATE POLICY ops_reports_self_insert
  ON public.operation_task_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY ops_reports_self_read
  ON public.operation_task_reports
  FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

CREATE POLICY ops_reports_admin_all
  ON public.operation_task_reports
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (get_operation_role(auth.uid()) = 'manager'::operation_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (get_operation_role(auth.uid()) = 'manager'::operation_role)
  );
