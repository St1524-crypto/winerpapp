
-- Extend dealer_tiers with star/director attributes
ALTER TABLE public.dealer_tiers
  ADD COLUMN IF NOT EXISTS monthly_points_required numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS global_bonus_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS global_bonus_income_threshold numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maintenance_required_new_e_store integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_mentor_count_secondary integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_mentor_tier_secondary text,
  ADD COLUMN IF NOT EXISTS freeze_when_points_below boolean NOT NULL DEFAULT false;

-- Seed V1 ~ V8 star tiers and director
INSERT INTO public.dealer_tiers (
  code, name, tier_type, sort_order,
  required_pv, required_direct_vip,
  required_mentor_tier, required_mentor_count,
  required_mentor_tier_secondary, required_mentor_count_secondary,
  condition_logic,
  rebate_rate, operating_bonus_rate, upgrade_bonus_cap,
  special_bonus_rate, special_bonus_trigger_count, special_bonus_label,
  maintenance_window_days, maintenance_required_vip, maintenance_required_new_e_store,
  monthly_points_required, freeze_when_points_below,
  global_bonus_rate, global_bonus_income_threshold,
  description
) VALUES
  ('V1','一星代理店 (AA)','star',6,0,0,'E',3,NULL,0,'AND',50,7,88000,0,0,NULL,180,1,0,300,true,0,0,'具 E/A 資格且輔導下線 3 位達 E 店；180 天需新增 1 位 VIP'),
  ('V2','二星代理店','star',7,0,0,'V1',2,NULL,0,'AND',50,0,268000,0,0,NULL,180,0,1,300,true,0,0,'達一星且輔導下線 2 位達 1 星店；180 天需輔導 1 位新 E 店'),
  ('V3','三星代理店','star',8,0,0,'V1',3,NULL,0,'AND',50,0,368000,0,0,NULL,180,0,1,300,true,0,0,'達二星且輔導下線 3 位達 1 星店；180 天需輔導 1 位新 E 店'),
  ('V4','四星代理店','star',9,0,0,'V1',4,NULL,0,'AND',50,7,468000,0,0,NULL,180,0,1,300,true,0,0,'達三星且輔導下線 4 位達 1 星店；180 天需輔導 1 位新 E 店'),
  ('V5','五星代理店','star',10,0,0,'V4',2,NULL,0,'AND',50,0,1568000,0,0,NULL,180,0,1,300,true,2,200000,'達四星且輔導下線 2 位達 4 星店；月收 < 200,000 觸發全球分紅 2%'),
  ('V6','六星代理店','star',11,0,0,'V5',1,NULL,0,'AND',50,0,2668000,0,0,NULL,180,0,1,300,true,2,300000,'達五星且輔導下線 1 位達 5 星店；月收 < 300,000 觸發全球分紅 2%'),
  ('V7','七星代理店','star',12,0,0,'V6',1,NULL,0,'AND',50,5,3768000,0,0,NULL,180,0,1,300,true,2,400000,'達六星且輔導下線 1 位達 6 星店；月收 < 400,000 觸發全球分紅 2%'),
  ('V8','董事','director',13,0,0,'V7',1,NULL,0,'AND',50,0,5868000,0,0,NULL,180,0,1,300,true,2,500000,'達七星且輔導下線 1 位達 7 星店；月收 < 500,000 觸發全球分紅 2%')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  tier_type = EXCLUDED.tier_type,
  sort_order = EXCLUDED.sort_order,
  required_mentor_tier = EXCLUDED.required_mentor_tier,
  required_mentor_count = EXCLUDED.required_mentor_count,
  condition_logic = EXCLUDED.condition_logic,
  rebate_rate = EXCLUDED.rebate_rate,
  operating_bonus_rate = EXCLUDED.operating_bonus_rate,
  upgrade_bonus_cap = EXCLUDED.upgrade_bonus_cap,
  maintenance_window_days = EXCLUDED.maintenance_window_days,
  maintenance_required_vip = EXCLUDED.maintenance_required_vip,
  maintenance_required_new_e_store = EXCLUDED.maintenance_required_new_e_store,
  monthly_points_required = EXCLUDED.monthly_points_required,
  freeze_when_points_below = EXCLUDED.freeze_when_points_below,
  global_bonus_rate = EXCLUDED.global_bonus_rate,
  global_bonus_income_threshold = EXCLUDED.global_bonus_income_threshold,
  description = EXCLUDED.description;
