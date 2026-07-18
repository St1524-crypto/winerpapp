
-- Fix 1: Remove NULL company_id bypass on business_accounts (sensitive B2B PII)
DROP POLICY IF EXISTS "tenant_scope" ON public.business_accounts;
CREATE POLICY "tenant_scope" ON public.business_accounts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (company_id IS NOT NULL AND company_id = private.current_company_id())
  );

-- Fix 2: Remove anon SELECT on product_wholesale_tiers.
-- Wholesale/tier pricing is only consumed by authenticated storefront (VIP/dealer/staff);
-- anon shoppers see the regular product price on public shop pages.
DROP POLICY IF EXISTS "Public read retail tiers" ON public.product_wholesale_tiers;
REVOKE SELECT ON public.product_wholesale_tiers FROM anon;
