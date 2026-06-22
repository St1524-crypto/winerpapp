GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_storefront_pages TO authenticated;
GRANT ALL ON public.member_storefront_pages TO service_role;

GRANT SELECT ON public.member_storefront_templates TO authenticated;
GRANT ALL ON public.member_storefront_templates TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_storefront_custom_templates TO authenticated;
GRANT ALL ON public.member_storefront_custom_templates TO service_role;