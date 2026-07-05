DROP POLICY IF EXISTS "authenticated read package products" ON public.vip_upgrade_package_products;

CREATE POLICY "read package products for active packages"
  ON public.vip_upgrade_package_products
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.vip_upgrade_packages p
      WHERE p.id = vip_upgrade_package_products.package_id
        AND p.status = 'active'
    )
  );