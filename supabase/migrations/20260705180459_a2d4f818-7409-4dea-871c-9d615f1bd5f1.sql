-- Remove anon/authenticated read of the sensitive vip_tiers base table.
-- Public/member reads must go through public.vip_tiers_public (sanitized view).
DROP POLICY IF EXISTS "Anyone can view active vip tiers" ON public.vip_tiers;
DROP POLICY IF EXISTS "vip_tiers public read active" ON public.vip_tiers;
REVOKE SELECT ON public.vip_tiers FROM anon, authenticated;