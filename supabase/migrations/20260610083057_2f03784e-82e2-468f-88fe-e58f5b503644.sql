
-- 1) Drop public read on group_buy_orders (was exposing user_id, amounts, payment_method)
DROP POLICY IF EXISTS "gbo public count read" ON public.group_buy_orders;

-- 2) Normalize ALL policies to use private.has_role
DROP POLICY IF EXISTS "Admins manage monthly tier bonus" ON public.monthly_tier_bonus_settings;
CREATE POLICY "Admins manage monthly tier bonus" ON public.monthly_tier_bonus_settings
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role));

DROP POLICY IF EXISTS "bonus_records admin write" ON public.bonus_records;
CREATE POLICY "bonus_records admin write" ON public.bonus_records
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role));

DROP POLICY IF EXISTS "bonus_records owner read" ON public.bonus_records;
CREATE POLICY "bonus_records owner read" ON public.bonus_records
  FOR SELECT TO authenticated
  USING (member_id = auth.uid() OR private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role) OR private.has_role(auth.uid(),'sales'::app_role));

DROP POLICY IF EXISTS "bonus_settings admin write" ON public.bonus_settings;
CREATE POLICY "bonus_settings admin write" ON public.bonus_settings
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role));

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT polname, polrelid::regclass::text AS tbl
    FROM pg_policy
    WHERE polrelid IN (
      'public.rank_rebate_settings'::regclass,
      'public.repurchase_bonus_settings'::regclass,
      'public.reward_wallet_logs'::regclass
    )
    AND pg_get_expr(polqual,polrelid) LIKE '%has_role(auth.uid()%'
    AND pg_get_expr(polqual,polrelid) NOT LIKE '%private.has_role%'
  LOOP
    EXECUTE format('DROP POLICY %I ON %s', r.polname, r.tbl);
  END LOOP;
END $$;

CREATE POLICY "rank_rebate_settings admin manage" ON public.rank_rebate_settings
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role));

CREATE POLICY "repurchase_bonus_settings admin manage" ON public.repurchase_bonus_settings
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role));

CREATE POLICY "reward_wallet_logs admin manage" ON public.reward_wallet_logs
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role));

-- 3) Add finance to profiles SELECT
DROP POLICY IF EXISTS "Sales view all profiles" ON public.profiles;
CREATE POLICY "Staff view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'admin'::app_role)
    OR private.has_role(auth.uid(),'finance'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role)
  );
