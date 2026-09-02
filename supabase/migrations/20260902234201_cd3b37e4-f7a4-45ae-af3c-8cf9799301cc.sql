GRANT SELECT, INSERT, UPDATE, DELETE ON public.vip_tiers TO authenticated;
GRANT ALL ON public.vip_tiers TO service_role;

GRANT SELECT ON public.vip_upgrade_packages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vip_upgrade_packages TO authenticated;
GRANT ALL ON public.vip_upgrade_packages TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vip_upgrade_package_products TO authenticated;
GRANT ALL ON public.vip_upgrade_package_products TO service_role;