DROP POLICY IF EXISTS tenant_scope_restrictive ON public.product_wholesale_tiers;
CREATE POLICY tenant_scope_restrictive ON public.product_wholesale_tiers
AS RESTRICTIVE FOR ALL TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_wholesale_tiers.product_id AND p.company_id IS NOT NULL AND p.company_id = private.current_company_id())
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_wholesale_tiers.product_id AND p.company_id IS NOT NULL AND p.company_id = private.current_company_id())
);