
CREATE TABLE IF NOT EXISTS public.vip_upgrade_package_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.vip_upgrade_packages(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(package_id, product_id)
);

GRANT SELECT ON public.vip_upgrade_package_products TO authenticated;
GRANT ALL ON public.vip_upgrade_package_products TO service_role;

ALTER TABLE public.vip_upgrade_package_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read package products"
  ON public.vip_upgrade_package_products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage package products"
  ON public.vip_upgrade_package_products
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'super_admin'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_vip_upg_pkg_products_pkg ON public.vip_upgrade_package_products(package_id);
CREATE INDEX IF NOT EXISTS idx_vip_upg_pkg_products_prod ON public.vip_upgrade_package_products(product_id);

-- Backfill from existing single product_id column
INSERT INTO public.vip_upgrade_package_products (package_id, product_id, sort_order)
SELECT id, product_id, 0
FROM public.vip_upgrade_packages
WHERE product_id IS NOT NULL
ON CONFLICT (package_id, product_id) DO NOTHING;
