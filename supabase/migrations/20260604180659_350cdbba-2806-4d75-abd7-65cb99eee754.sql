DROP POLICY IF EXISTS "Authenticated view warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Authenticated view wh inventory" ON public.warehouse_inventory;

CREATE POLICY "Staff view warehouses"
  ON public.warehouses FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
  );

CREATE POLICY "Staff view wh inventory"
  ON public.warehouse_inventory FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
  );
