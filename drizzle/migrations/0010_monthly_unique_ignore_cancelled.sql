DROP INDEX IF EXISTS public.uniq_bonus_records_monthly;
CREATE UNIQUE INDEX uniq_bonus_records_monthly ON public.bonus_records USING btree (member_id, bonus_type, settlement_date)
WHERE bonus_type = ANY (ARRAY['monthly_vip'::text, 'rank_rebate'::text]) AND settlement_date IS NOT NULL AND status <> 'cancelled';