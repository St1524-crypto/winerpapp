
-- sales_orders
DROP POLICY IF EXISTS tenant_scope ON public.sales_orders;
CREATE POLICY tenant_scope ON public.sales_orders
  AS RESTRICTIVE
  FOR ALL
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR company_id = private.current_company_id()
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR company_id = private.current_company_id()
  );

-- sales_order_items
DROP POLICY IF EXISTS tenant_scope ON public.sales_order_items;
CREATE POLICY tenant_scope ON public.sales_order_items
  AS RESTRICTIVE
  FOR ALL
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR company_id = private.current_company_id()
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR company_id = private.current_company_id()
  );

-- payments
DROP POLICY IF EXISTS tenant_scope ON public.payments;
CREATE POLICY tenant_scope ON public.payments
  AS RESTRICTIVE
  FOR ALL
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR company_id = private.current_company_id()
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR company_id = private.current_company_id()
  );
