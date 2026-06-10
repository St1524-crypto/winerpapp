
-- 1. group_buy_settings: restrict reads to admin/staff
DROP POLICY IF EXISTS "gbs read" ON public.group_buy_settings;
CREATE POLICY "gbs read" ON public.group_buy_settings FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'finance'::app_role)
  OR private.has_role(auth.uid(), 'sales'::app_role)
);

-- 2. product_images: scope reads to user's company (tenant_scope already restrictive ALL, but SELECT policy is permissive true; replace it)
DROP POLICY IF EXISTS "Authenticated view product images" ON public.product_images;
CREATE POLICY "Authenticated view product images" ON public.product_images FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id = private.current_company_id()
);

-- 3. Replace public.has_role with private.has_role in policies
-- support_checkins
DROP POLICY IF EXISTS "admins view checkins" ON public.support_checkins;
CREATE POLICY "admins view checkins" ON public.support_checkins FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'sales'::app_role));

-- support_messages
DROP POLICY IF EXISTS "admins view all messages" ON public.support_messages;
CREATE POLICY "admins view all messages" ON public.support_messages FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'sales'::app_role));

-- support_threads
DROP POLICY IF EXISTS "admins view all threads" ON public.support_threads;
CREATE POLICY "admins view all threads" ON public.support_threads FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'sales'::app_role));

-- support_announcements
DROP POLICY IF EXISTS "admins manage announcements" ON public.support_announcements;
CREATE POLICY "admins manage announcements" ON public.support_announcements FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "authenticated read active announcements" ON public.support_announcements;
CREATE POLICY "authenticated read active announcements" ON public.support_announcements FOR SELECT TO authenticated
USING (is_active = true OR private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

-- bonus_settlement_batches
DROP POLICY IF EXISTS "batches admin all" ON public.bonus_settlement_batches;
CREATE POLICY "batches admin all" ON public.bonus_settlement_batches FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'finance'::app_role) OR private.has_role(auth.uid(), 'sales'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'finance'::app_role));

-- product_wholesale_tiers
DROP POLICY IF EXISTS "Admins manage wholesale tiers (delete)" ON public.product_wholesale_tiers;
CREATE POLICY "Admins manage wholesale tiers (delete)" ON public.product_wholesale_tiers FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage wholesale tiers (insert)" ON public.product_wholesale_tiers;
CREATE POLICY "Admins manage wholesale tiers (insert)" ON public.product_wholesale_tiers FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage wholesale tiers (update)" ON public.product_wholesale_tiers;
CREATE POLICY "Admins manage wholesale tiers (update)" ON public.product_wholesale_tiers FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- monthly_responsibility_points
DROP POLICY IF EXISTS "members view own monthly points" ON public.monthly_responsibility_points;
CREATE POLICY "members view own monthly points" ON public.monthly_responsibility_points FOR SELECT TO authenticated
USING (auth.uid() = member_id OR private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'finance'::app_role));

-- 4. webhook_deliveries: restrict insert to admin/service_role
DROP POLICY IF EXISTS "wd service insert" ON public.webhook_deliveries;
CREATE POLICY "wd service insert" ON public.webhook_deliveries FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

-- 5. webhook_endpoints: add tenant scoping
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_scope" ON public.webhook_endpoints;
CREATE POLICY "tenant_scope" ON public.webhook_endpoints AS RESTRICTIVE FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR company_id = private.current_company_id())
WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role) OR company_id = private.current_company_id());
