
DROP VIEW IF EXISTS public.vip_tiers_public;

CREATE VIEW public.vip_tiers_public
WITH (security_invoker = on) AS
SELECT id, code, name, sort_order, status,
       required_reward_points, required_direct_vip,
       required_mentor_tier, required_mentor_count,
       renewal_window_days, renewal_required_new_vip,
       description
FROM public.vip_tiers
WHERE status = 'active';

GRANT SELECT ON public.vip_tiers_public TO anon, authenticated;

-- Restore public read policy for active tiers (was dropped in 20260702004810)
DROP POLICY IF EXISTS "vip_tiers public read active" ON public.vip_tiers;
CREATE POLICY "vip_tiers public read active"
  ON public.vip_tiers
  FOR SELECT
  TO anon, authenticated
  USING (status = 'active');

GRANT SELECT ON public.vip_tiers TO anon, authenticated;
