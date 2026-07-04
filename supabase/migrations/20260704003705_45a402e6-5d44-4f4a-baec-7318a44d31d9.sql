-- Recreate vip_tiers_public with security_invoker to avoid SECURITY DEFINER view lint.
-- Add an RLS policy on vip_tiers so anon/authenticated can read active tiers,
-- which lets the invoker-side view work without elevating privileges.

DROP VIEW IF EXISTS public.vip_tiers_public;

CREATE VIEW public.vip_tiers_public
WITH (security_invoker = on) AS
SELECT
  id, code, name, sort_order, status,
  cashback_rate, revenue_share_rate,
  business_bonus_rate, business_bonus_cap_amount,
  upgrade_bonus_cap, upgrade_bonus_cap_amount,
  upgrade_bonus_cap_basis, upgrade_total_earnings_cap_amount
FROM public.vip_tiers
WHERE status = 'active';

GRANT SELECT ON public.vip_tiers_public TO anon, authenticated;

-- Ensure base table is readable for active rows by anyone (required for invoker view).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='vip_tiers' AND policyname='Anyone can view active vip tiers'
  ) THEN
    DROP POLICY "Anyone can view active vip tiers" ON public.vip_tiers;
  END IF;
END $$;

CREATE POLICY "Anyone can view active vip tiers"
ON public.vip_tiers
FOR SELECT
TO anon, authenticated
USING (status = 'active');

GRANT SELECT ON public.vip_tiers TO anon, authenticated;
