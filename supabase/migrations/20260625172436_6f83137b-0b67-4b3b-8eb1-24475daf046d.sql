-- A. Public storefront safe view on profiles (defensive; base table already locks anon out)
CREATE OR REPLACE VIEW public.profiles_public_safe
WITH (security_invoker = on) AS
SELECT
  id,
  member_no,
  marketing_slug,
  display_name,
  brand_name,
  brand_intro,
  profile_avatar,
  profile_cover,
  line_url,
  facebook_url,
  instagram_url,
  youtube_url,
  page_template
FROM public.profiles
WHERE (frozen_code IS NULL OR frozen_code = 'N')
  AND (member_status IS NULL OR member_status IN ('active','正式會員'));

REVOKE ALL ON public.profiles_public_safe FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles_public_safe TO anon, authenticated;
COMMENT ON VIEW public.profiles_public_safe IS
  'Public-safe projection of profiles for storefront/member-page use. security_invoker honors profiles RLS; only safe columns are exposed.';

-- B. operation_tasks — restrict to authenticated, exclude NULL owner/assignee from staff read
DROP POLICY IF EXISTS "ops_tasks_assignee_read" ON public.operation_tasks;
CREATE POLICY "ops_tasks_assignee_read"
  ON public.operation_tasks
  FOR SELECT
  TO authenticated
  USING (
    public.is_operation_participant(auth.uid())
    AND (
      (assignee_id IS NOT NULL AND assignee_id = auth.uid())
      OR (created_by IS NOT NULL AND created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "ops_tasks_assignee_update" ON public.operation_tasks;
CREATE POLICY "ops_tasks_assignee_update"
  ON public.operation_tasks
  FOR UPDATE
  TO authenticated
  USING (
    assignee_id IS NOT NULL
    AND assignee_id = auth.uid()
    AND public.is_operation_participant(auth.uid())
  );

DROP POLICY IF EXISTS "ops_tasks_admin_all" ON public.operation_tasks;
CREATE POLICY "ops_tasks_admin_all"
  ON public.operation_tasks
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "ops_tasks_manager_all" ON public.operation_tasks;
CREATE POLICY "ops_tasks_manager_all"
  ON public.operation_tasks
  FOR ALL
  TO authenticated
  USING (public.get_operation_role(auth.uid()) = 'manager'::public.operation_role)
  WITH CHECK (public.get_operation_role(auth.uid()) = 'manager'::public.operation_role);

-- C. dealer_tiers public summary view (safe non-financial fields only)
CREATE OR REPLACE VIEW public.dealer_tiers_public_summary
WITH (security_invoker = off) AS
SELECT
  code,
  name,
  tier_type,
  sort_order,
  description,
  status
FROM public.dealer_tiers
WHERE status = 'active';

REVOKE ALL ON public.dealer_tiers_public_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.dealer_tiers_public_summary TO authenticated;
COMMENT ON VIEW public.dealer_tiers_public_summary IS
  'Public summary of dealer tiers for member display. Excludes financial fields (rebate_rate, bonus rates, caps, PV thresholds).';