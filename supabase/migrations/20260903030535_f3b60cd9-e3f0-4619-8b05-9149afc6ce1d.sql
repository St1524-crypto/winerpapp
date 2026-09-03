ALTER VIEW public.vip_tiers_public SET (security_invoker = off);
GRANT SELECT ON public.vip_tiers_public TO anon, authenticated;
GRANT ALL ON public.vip_tiers_public TO service_role;