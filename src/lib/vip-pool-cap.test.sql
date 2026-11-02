-- Run only on an EMPTY disposable PostgreSQL database:
-- psql -X -v ON_ERROR_STOP=1 -f src/lib/vip-pool-cap.test.sql
-- Uses the real payout schema, calculation helper and migration function.
-- Eligibility/auth stubs isolate payout behavior; no live member data is used.
BEGIN;
CREATE SCHEMA private;
CREATE SCHEMA auth;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TYPE public.app_role AS ENUM ('super_admin','admin','finance');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION private.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
\ir ../../supabase/migrations/20260624140016_e1cc67ff-f058-41e5-9ea9-26a1514c6331.sql
ALTER TABLE public.vip_bonus_pool_payouts ADD COLUMN calculation_detail jsonb;
CREATE TABLE public.member_dividend_exclusions(user_id uuid);
CREATE TABLE public.vip_tiers(code text, upgrade_bonus_cap numeric, business_bonus_cap_amount numeric);
CREATE TABLE public.vip_upgrade_bonus_ledger(member_id uuid, payable_amount numeric, status text);
CREATE TEMP TABLE candidates(member_id uuid, legacy_code text, mapped_code text, pool_ordinal text, tier_mapping_source text);
CREATE FUNCTION private.pool_kind_for_code(text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN $1 = 'POOL_VSTEA' THEN 'consumption' ELSE 'business' END
$$;
CREATE FUNCTION private.list_pool_eligible_members(uuid,date)
RETURNS TABLE(member_id uuid, legacy_code text, mapped_code text, pool_ordinal text, tier_mapping_source text)
LANGUAGE sql AS $$ SELECT * FROM candidates $$;
\ir ../../drizzle/migrations/0008_pool_daily_business_caps.sql
INSERT INTO public.vip_bonus_pools(id,name,code,tier_codes,bonus_rate,total_income_cap_amount)
VALUES ('00000000-0000-0000-0000-000000000001','Test business','POOL_123','{STAR1}',0.05,100),
       ('00000000-0000-0000-0000-000000000002','Test consumption','POOL_VSTEA','{E}',0.05,100);
INSERT INTO candidates VALUES
 ('00000000-0000-0000-0000-000000000011','V1','STAR1','1','test'),
 ('00000000-0000-0000-0000-000000000012','V1','STAR1','1','test'),
 ('00000000-0000-0000-0000-000000000013','V1','STAR1','1','test');
INSERT INTO public.vip_upgrade_bonus_ledger VALUES
 ('00000000-0000-0000-0000-000000000011',100,'released'),
 ('00000000-0000-0000-0000-000000000013',90,'released');
DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.distribute_vip_bonus_pool_daily('00000000-0000-0000-0000-000000000001','2026-11-01',1200);
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  IF NOT rejected OR EXISTS (SELECT 1 FROM public.vip_bonus_pool_payouts) THEN
    RAISE EXCEPTION 'Original function must reproduce check violation and whole-pool rollback';
  END IF;
  RAISE NOTICE 'PASS: original failure reproduced, pool rolled back';
END $$;
\ir ../../drizzle/migrations/0009_fix_pool_skipped_capped_status.sql
DO $$
DECLARE result record;
BEGIN
  SELECT * INTO result FROM public.distribute_vip_bonus_pool_daily('00000000-0000-0000-0000-000000000001','2026-11-01',1200);
  IF result.eligible_count <> 3 OR result.distributed_count <> 2 OR result.skipped_count <> 1 THEN
    RAISE EXCEPTION 'Expected three members, two paid and one skipped';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vip_bonus_pool_payouts WHERE member_id='00000000-0000-0000-0000-000000000011'
      AND status='skipped_capped' AND payable_amount=0 AND capped_amount=20 AND total_after=100
      AND calculation_detail->>'block_reason'='已達累計上限停發') THEN
    RAISE EXCEPTION 'Fully capped member must record zero payable and cap reason';
  END IF;
  RAISE NOTICE 'PASS: maxed member records skipped_capped';
  IF NOT EXISTS (SELECT 1 FROM public.vip_bonus_pool_payouts WHERE member_id='00000000-0000-0000-0000-000000000012'
      AND status='released' AND payable_amount=20 AND capped_amount=0 AND total_after=20) THEN
    RAISE EXCEPTION 'Uncapped member must still receive the 20 point equal allocation';
  END IF;
  RAISE NOTICE 'PASS: other member still receives full allocation';
  IF NOT EXISTS (SELECT 1 FROM public.vip_bonus_pool_payouts WHERE member_id='00000000-0000-0000-0000-000000000013'
      AND status='partial_capped' AND payable_amount=10 AND capped_amount=10 AND total_after=100) THEN
    RAISE EXCEPTION 'Partial cap must pay only remaining 10 points';
  END IF;
  RAISE NOTICE 'PASS: partial cap unchanged';
  SELECT * INTO result FROM public.distribute_vip_bonus_pool_daily('00000000-0000-0000-0000-000000000001','2026-11-01',1200);
  IF result.distributed_count <> 0 OR result.skipped_count <> 3 OR (SELECT count(*) FROM public.vip_bonus_pool_payouts) <> 3 THEN
    RAISE EXCEPTION 'Rerun must not duplicate any payout';
  END IF;
  RAISE NOTICE 'PASS: rerun idempotent';
  UPDATE public.vip_bonus_pool_payouts SET pool_id='00000000-0000-0000-0000-000000000002',payable_amount=100,total_after=100
    WHERE member_id='00000000-0000-0000-0000-000000000011';
  SELECT * INTO result FROM public.distribute_vip_bonus_pool_daily('00000000-0000-0000-0000-000000000002','2026-11-02',1200);
  IF result.distributed_count <> 2 OR result.skipped_count <> 1 OR NOT EXISTS
    (SELECT 1 FROM public.vip_bonus_pool_payouts WHERE pool_id='00000000-0000-0000-0000-000000000002'
       AND payout_date='2026-11-02' AND member_id='00000000-0000-0000-0000-000000000011' AND status='skipped_capped' AND payable_amount=0) THEN
    RAISE EXCEPTION 'Consumption pool shares the safe capped status';
  END IF;
  RAISE NOTICE 'PASS: consumption cap path also safe';
END $$;
ROLLBACK;