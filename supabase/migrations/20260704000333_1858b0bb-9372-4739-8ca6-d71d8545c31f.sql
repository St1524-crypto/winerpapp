-- Fix VIP tier visibility: allow shoppers (anon) to read the public view,
-- and restore authenticated SELECT so admin server functions can query base table.
-- View recreated without security_invoker so it runs as owner (bypasses base-table
-- RLS for the safe-column projection).

DROP VIEW IF EXISTS public.vip_tiers_public;
CREATE VIEW public.vip_tiers_public AS
SELECT id, code, name, description, sort_order, status,
       required_reward_points, required_direct_vip,
       required_mentor_tier, required_mentor_count,
       renewal_window_days, renewal_required_new_vip,
       cashback_rate, revenue_share_rate
FROM public.vip_tiers
WHERE status = 'active';

GRANT SELECT ON public.vip_tiers_public TO anon, authenticated;

-- Restore SELECT grant on base table for authenticated. RLS still restricts
-- rows to admins via existing "vip_tiers admin manage" policy.
GRANT SELECT ON public.vip_tiers TO authenticated;