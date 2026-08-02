-- 1) cooperation_applications: tenant scope
ALTER TABLE public.cooperation_applications
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cooperation_applications_company_id
  ON public.cooperation_applications(company_id);

DROP POLICY IF EXISTS tenant_scope_restrictive ON public.cooperation_applications;
CREATE POLICY tenant_scope_restrictive
  ON public.cooperation_applications
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    company_id IS NOT NULL AND company_id = private.current_company_id()
  )
  WITH CHECK (
    company_id IS NOT NULL AND company_id = private.current_company_id()
  );

-- 2) member_featured_products: only published storefronts visible to other members
DROP POLICY IF EXISTS "Authenticated read featured for visible members" ON public.member_featured_products;
CREATE POLICY "Authenticated read featured for visible members"
  ON public.member_featured_products
  FOR SELECT
  TO authenticated
  USING (
    member_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.member_storefront_pages sp
      JOIN public.profiles p ON p.id = member_featured_products.member_id
      WHERE sp.member_id = member_featured_products.member_id
        AND sp.published_at IS NOT NULL
        AND sp.published_at <= now()
        AND (p.frozen_code IS NULL OR p.frozen_code = 'N')
        AND (p.member_status IS NULL OR p.member_status IN ('active', '正式會員'))
    )
  );

-- 3) product_wholesale_tiers: defense-in-depth company validation on writes
DROP POLICY IF EXISTS "Admins manage wholesale tiers (insert)" ON public.product_wholesale_tiers;
CREATE POLICY "Admins manage wholesale tiers (insert)"
  ON public.product_wholesale_tiers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_wholesale_tiers.product_id
        AND (
          private.has_role(auth.uid(), 'super_admin'::app_role)
          OR (p.company_id IS NOT NULL AND p.company_id = private.current_company_id())
        )
    )
  );

DROP POLICY IF EXISTS "Admins manage wholesale tiers (update)" ON public.product_wholesale_tiers;
CREATE POLICY "Admins manage wholesale tiers (update)"
  ON public.product_wholesale_tiers
  FOR UPDATE
  TO authenticated
  USING (
    (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_wholesale_tiers.product_id
        AND (
          private.has_role(auth.uid(), 'super_admin'::app_role)
          OR (p.company_id IS NOT NULL AND p.company_id = private.current_company_id())
        )
    )
  )
  WITH CHECK (
    (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_wholesale_tiers.product_id
        AND (
          private.has_role(auth.uid(), 'super_admin'::app_role)
          OR (p.company_id IS NOT NULL AND p.company_id = private.current_company_id())
        )
    )
  );

DROP POLICY IF EXISTS "Admins manage wholesale tiers (delete)" ON public.product_wholesale_tiers;
CREATE POLICY "Admins manage wholesale tiers (delete)"
  ON public.product_wholesale_tiers
  FOR DELETE
  TO authenticated
  USING (
    (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_wholesale_tiers.product_id
        AND (
          private.has_role(auth.uid(), 'super_admin'::app_role)
          OR (p.company_id IS NOT NULL AND p.company_id = private.current_company_id())
        )
    )
  );