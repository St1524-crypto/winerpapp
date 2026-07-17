-- Harden return tables tenant scoped RLS.
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_returns_tenant_scope ON public.sales_returns;
CREATE POLICY sales_returns_tenant_scope
  ON public.sales_returns AS RESTRICTIVE FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR company_id = private.current_company_id())
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role) OR company_id = private.current_company_id());

DROP POLICY IF EXISTS "Admin and finance manage sales returns" ON public.sales_returns;
CREATE POLICY "Admin and finance manage sales returns"
  ON public.sales_returns FOR ALL TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR ((private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'finance'::app_role))
        AND company_id = private.current_company_id())
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR ((private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'finance'::app_role))
        AND company_id = private.current_company_id())
  );

DROP POLICY IF EXISTS sales_return_items_tenant_scope ON public.sales_return_items;
CREATE POLICY sales_return_items_tenant_scope
  ON public.sales_return_items AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales_returns sr WHERE sr.id = sales_return_items.sales_return_id
    AND (private.has_role(auth.uid(), 'super_admin'::app_role) OR sr.company_id = private.current_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales_returns sr WHERE sr.id = sales_return_items.sales_return_id
    AND (private.has_role(auth.uid(), 'super_admin'::app_role) OR sr.company_id = private.current_company_id())));

DROP POLICY IF EXISTS "Admin and finance manage sales return items" ON public.sales_return_items;
CREATE POLICY "Admin and finance manage sales return items"
  ON public.sales_return_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales_returns sr WHERE sr.id = sales_return_items.sales_return_id
    AND (private.has_role(auth.uid(), 'super_admin'::app_role)
      OR ((private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'finance'::app_role))
          AND sr.company_id = private.current_company_id()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales_returns sr WHERE sr.id = sales_return_items.sales_return_id
    AND (private.has_role(auth.uid(), 'super_admin'::app_role)
      OR ((private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'finance'::app_role))
          AND sr.company_id = private.current_company_id()))));

DROP POLICY IF EXISTS purchase_returns_tenant_scope ON public.purchase_returns;
CREATE POLICY purchase_returns_tenant_scope
  ON public.purchase_returns AS RESTRICTIVE FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR company_id = private.current_company_id())
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role) OR company_id = private.current_company_id());

DROP POLICY IF EXISTS "purchase_returns admin manage" ON public.purchase_returns;
CREATE POLICY "purchase_returns admin manage"
  ON public.purchase_returns FOR ALL TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR ((private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'finance'::app_role))
        AND company_id = private.current_company_id())
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR ((private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'finance'::app_role))
        AND company_id = private.current_company_id())
  );

DROP POLICY IF EXISTS purchase_return_items_tenant_scope ON public.purchase_return_items;
CREATE POLICY purchase_return_items_tenant_scope
  ON public.purchase_return_items AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_returns pr WHERE pr.id = purchase_return_items.purchase_return_id
    AND (private.has_role(auth.uid(), 'super_admin'::app_role) OR pr.company_id = private.current_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_returns pr WHERE pr.id = purchase_return_items.purchase_return_id
    AND (private.has_role(auth.uid(), 'super_admin'::app_role) OR pr.company_id = private.current_company_id())));

DROP POLICY IF EXISTS "purchase_return_items admin manage" ON public.purchase_return_items;
CREATE POLICY "purchase_return_items admin manage"
  ON public.purchase_return_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_returns pr WHERE pr.id = purchase_return_items.purchase_return_id
    AND (private.has_role(auth.uid(), 'super_admin'::app_role)
      OR ((private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'finance'::app_role))
          AND pr.company_id = private.current_company_id()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_returns pr WHERE pr.id = purchase_return_items.purchase_return_id
    AND (private.has_role(auth.uid(), 'super_admin'::app_role)
      OR ((private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'finance'::app_role))
          AND pr.company_id = private.current_company_id()))));