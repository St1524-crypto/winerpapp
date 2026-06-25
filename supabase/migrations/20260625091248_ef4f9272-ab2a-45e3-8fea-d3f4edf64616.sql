ALTER TABLE public.annual_fee_vip_rules
  ADD COLUMN IF NOT EXISTS target_tier_code text,
  ADD COLUMN IF NOT EXISTS reward_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS show_on_vip_upgrade_page boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS annual_fee_vip_rules_sort_idx
  ON public.annual_fee_vip_rules (show_on_vip_upgrade_page, sort_order);