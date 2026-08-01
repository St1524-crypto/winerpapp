DROP POLICY IF EXISTS tenant_scope ON public.products;
CREATE POLICY tenant_scope ON public.products
AS RESTRICTIVE
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id = private.current_company_id()
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id = private.current_company_id()
);