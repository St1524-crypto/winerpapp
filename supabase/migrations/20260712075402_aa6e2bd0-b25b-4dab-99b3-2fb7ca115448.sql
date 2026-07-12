
-- 1) Tenant scope for homepage_sections & homepage_section_products & homepage_featured_products
ALTER TABLE public.homepage_sections
  ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT private.current_company_id();
ALTER TABLE public.homepage_section_products
  ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT private.current_company_id();

-- Backfill homepage_sections.company_id from any existing default company if null
UPDATE public.homepage_sections SET company_id = COALESCE(company_id, private.current_company_id());
UPDATE public.homepage_section_products hsp
   SET company_id = COALESCE(hsp.company_id, hs.company_id)
  FROM public.homepage_sections hs
 WHERE hsp.section_id = hs.id;

CREATE INDEX IF NOT EXISTS idx_homepage_sections_company ON public.homepage_sections(company_id);
CREATE INDEX IF NOT EXISTS idx_homepage_section_products_company ON public.homepage_section_products(company_id);

-- Restrictive tenant-scope policies (consistent with other tables)
DROP POLICY IF EXISTS homepage_sections_tenant_scope ON public.homepage_sections;
CREATE POLICY homepage_sections_tenant_scope ON public.homepage_sections
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (company_id IS NULL OR company_id = private.current_company_id())
  WITH CHECK (company_id IS NULL OR company_id = private.current_company_id());

DROP POLICY IF EXISTS homepage_section_products_tenant_scope ON public.homepage_section_products;
CREATE POLICY homepage_section_products_tenant_scope ON public.homepage_section_products
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (company_id IS NULL OR company_id = private.current_company_id())
  WITH CHECK (company_id IS NULL OR company_id = private.current_company_id());

DROP POLICY IF EXISTS homepage_featured_products_tenant_scope ON public.homepage_featured_products;
CREATE POLICY homepage_featured_products_tenant_scope ON public.homepage_featured_products
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (company_id IS NULL OR company_id = private.current_company_id())
  WITH CHECK (company_id IS NULL OR company_id = private.current_company_id());

-- 2) Harden branding-pending storage read policy: validate UUID format before comparing,
--    and prefer a DB-verified ownership join on auth.users.id.
DROP POLICY IF EXISTS branding_pending_admin_read ON storage.objects;
CREATE POLICY branding_pending_admin_read ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'branding-pending'
    AND (storage.foldername(name))[1] = 'pending'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
      private.has_role(auth.uid(), 'super_admin'::app_role)
      OR (
        private.has_role(auth.uid(), 'admin'::app_role)
        AND EXISTS (
          SELECT 1
          FROM public.company_members cm_admin
          JOIN public.company_members cm_owner
            ON cm_admin.company_id = cm_owner.company_id
          JOIN auth.users u
            ON u.id = cm_owner.user_id
          WHERE cm_admin.user_id = auth.uid()
            AND cm_admin.company_id = private.current_company_id()
            AND u.id::text = (storage.foldername(objects.name))[2]
        )
      )
    )
  );

-- Same UUID-format validation on owner_all policy for consistency
DROP POLICY IF EXISTS branding_pending_owner_all ON storage.objects;
CREATE POLICY branding_pending_owner_all ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'branding-pending'
    AND (storage.foldername(name))[1] = 'pending'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'branding-pending'
    AND (storage.foldername(name))[1] = 'pending'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  );

-- 3) Defense-in-depth for VIP/dealer self-promotion: revoke column-level UPDATE
--    on privileged profile flags so even a trigger bypass cannot flip them via the Data API.
REVOKE UPDATE (is_vip, is_dealer, vip_tier, vip_expires_at, member_status, legacy_bonus_total, legacy_rank, referred_by)
  ON public.profiles FROM authenticated, anon;
REVOKE INSERT (is_vip, is_dealer, vip_tier, vip_expires_at, legacy_bonus_total, legacy_rank)
  ON public.profiles FROM authenticated, anon;
-- service_role and privileged server paths continue to use supabaseAdmin, which bypasses these grants.
