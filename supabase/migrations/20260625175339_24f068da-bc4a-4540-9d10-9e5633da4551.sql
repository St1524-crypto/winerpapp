
ALTER TABLE public.vip_upgrade_packages
  ADD COLUMN IF NOT EXISTS package_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vip_upgrade_packages_package_product_id
  ON public.vip_upgrade_packages(package_product_id);
