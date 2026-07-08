
ALTER TABLE public.bonus_settlement_batches
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.bonus_settlement_batches
  DROP CONSTRAINT IF EXISTS bonus_settlement_batches_status_check;
ALTER TABLE public.bonus_settlement_batches
  ADD CONSTRAINT bonus_settlement_batches_status_check
  CHECK (status = ANY (ARRAY['processing','completed','failed','running']));

ALTER TABLE public.bonus_records
  ADD COLUMN IF NOT EXISTS layer_level integer;

ALTER TABLE public.bonus_records
  DROP CONSTRAINT IF EXISTS bonus_records_bonus_type_check;
ALTER TABLE public.bonus_records
  ADD CONSTRAINT bonus_records_bonus_type_check
  CHECK (bonus_type = ANY (ARRAY['referral','repurchase','monthly_vip','rank_rebate','rank_diff_rebate']));
