
-- 1) cooperation_applications: restrict cross-tenant PII to super_admin only
DROP POLICY IF EXISTS "Admins can view cooperation applications" ON public.cooperation_applications;
DROP POLICY IF EXISTS "Admins can update cooperation applications" ON public.cooperation_applications;

CREATE POLICY "Super admins can view cooperation applications"
  ON public.cooperation_applications FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update cooperation applications"
  ON public.cooperation_applications FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 2) member_featured_products: only expose to anon when the member has a PUBLISHED storefront page
DROP POLICY IF EXISTS "Public read featured for visible members" ON public.member_featured_products;

CREATE POLICY "Public read featured for published storefronts"
  ON public.member_featured_products FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.member_storefront_pages sp
      WHERE sp.member_id = member_featured_products.member_id
        AND sp.published_at IS NOT NULL
    )
  );
