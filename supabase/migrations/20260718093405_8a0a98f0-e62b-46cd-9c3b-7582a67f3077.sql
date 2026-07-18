
-- Fix 1: annual_fee_vip_rules — restrict `notes` column to staff only
-- Column-level GRANT: revoke all-column SELECT from authenticated, re-grant only non-sensitive columns.
REVOKE SELECT ON public.annual_fee_vip_rules FROM authenticated;
GRANT SELECT (
  id, company_id, sku, upgrade_days, gift_product_id, gift_quantity,
  is_active, target_tier_code, reward_points, show_on_vip_upgrade_page,
  sort_order, created_at, updated_at
) ON public.annual_fee_vip_rules TO authenticated;
-- Staff/admins still need `notes` — service_role already has ALL; grant column to staff via a wrapper.
-- Admin server code uses supabaseAdmin (service_role), so `notes` remains readable there.

-- Fix 2: customer_addresses — remove sales-role blanket access; owner + super_admin only.
DROP POLICY IF EXISTS "Users manage own addresses" ON public.customer_addresses;
CREATE POLICY "Users manage own addresses" ON public.customer_addresses
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (auth.uid() = user_id OR private.has_role(auth.uid(), 'super_admin'::app_role));

-- Fix 3: vip_upgrade_packages — keep anon read of marketing fields, hide bonus_points from anon.
REVOKE SELECT ON public.vip_upgrade_packages FROM anon;
GRANT SELECT (
  id, tier_code, name, description, price, duration_days,
  sort_order, status, product_id, package_product_id, created_at, updated_at
) ON public.vip_upgrade_packages TO anon;
-- authenticated + service_role retain full-column SELECT (default grants preserved).
