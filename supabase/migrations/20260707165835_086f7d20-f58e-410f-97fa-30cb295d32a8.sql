-- Align vip_upgrade_package_products admin management policy to use the same
-- private.has_role qualifier as the read policy, removing the inconsistent
-- unqualified has_role() reference flagged by the scanner.
DROP POLICY IF EXISTS "admins manage package products" ON public.vip_upgrade_package_products;

CREATE POLICY "admins manage package products"
ON public.vip_upgrade_package_products
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
);