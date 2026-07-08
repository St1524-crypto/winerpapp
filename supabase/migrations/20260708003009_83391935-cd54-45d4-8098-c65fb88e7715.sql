
ALTER TABLE public.dealer_tiers
  ADD COLUMN IF NOT EXISTS daily_referral_rate numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.dealer_tiers.daily_referral_rate IS
  '日獎金推薦分潤比例（%）。用於 processUpgrade 差額制計算，越上位階者可拿到與下位階的差額分潤。';

UPDATE public.dealer_tiers SET daily_referral_rate = CASE code
  WHEN 'V'  THEN 5
  WHEN 'S'  THEN 15
  WHEN 'T'  THEN 20
  WHEN 'E'  THEN 40
  WHEN 'A'  THEN 50
  WHEN 'V1' THEN 50
  WHEN 'V2' THEN 50
  WHEN 'V3' THEN 50
  WHEN 'V4' THEN 50
  WHEN 'V5' THEN 50
  WHEN 'V6' THEN 50
  WHEN 'V7' THEN 50
  WHEN 'V8' THEN 50
  ELSE daily_referral_rate
END;
