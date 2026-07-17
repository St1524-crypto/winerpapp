
-- 1) Scope restrictive tenant policy on dealer_tier_history to authenticated
ALTER POLICY "dth tenant_scope restrictive" ON public.dealer_tier_history TO authenticated;

-- 2) Restrict tier_code_mapping reads to staff roles (was USING (true) for any authenticated user)
DROP POLICY IF EXISTS tier_code_mapping_select_auth ON public.tier_code_mapping;
CREATE POLICY tier_code_mapping_select_auth ON public.tier_code_mapping
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
  );

-- 3) Align public storefront featured-products policy with authenticated policy's active/frozen check
DROP POLICY IF EXISTS "Public read featured for published storefronts" ON public.member_featured_products;
CREATE POLICY "Public read featured for published storefronts" ON public.member_featured_products
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.member_storefront_pages sp
      JOIN public.profiles p ON p.id = member_featured_products.member_id
      WHERE sp.member_id = member_featured_products.member_id
        AND sp.published_at IS NOT NULL
        AND ((p.frozen_code IS NULL) OR (p.frozen_code = 'N'))
        AND ((p.member_status IS NULL) OR (p.member_status = 'active') OR (p.member_status = '正式會員'))
    )
  );
