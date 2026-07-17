-- Batch 2A-DB: remove rank_rebate from daily settlement.
--
-- Purpose:
--   The new bonus rules classify rank_rebate as monthly-only. Daily settlement
--   must no longer pick pending rank_rebate records.
--
-- Safety:
--   - No data updates.
--   - No wallet / reward_wallet_logs / point_transactions writes.
--   - No historical recompute.
--   - Preserve the current production function body except for the daily
--     pending bonus_type whitelist.

DO $$
DECLARE
  _fn text;
  _before text := 'b.bonus_type IN (''referral'',''repurchase'',''rank_rebate'')';
  _after text := 'b.bonus_type IN (''referral'',''repurchase'')';
BEGIN
  SELECT pg_get_functiondef('public.settle_daily_bonus(uuid, boolean)'::regprocedure)
    INTO _fn;

  IF _fn IS NULL THEN
    RAISE EXCEPTION 'public.settle_daily_bonus(uuid, boolean) does not exist';
  END IF;

  IF position(_before in _fn) > 0 THEN
    _fn := replace(_fn, _before, _after);
    EXECUTE _fn;
  ELSIF position(_after in _fn) > 0 THEN
    RAISE NOTICE 'settle_daily_bonus already excludes rank_rebate from daily pending whitelist';
  ELSE
    RAISE EXCEPTION 'settle_daily_bonus daily pending whitelist did not match expected text';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_daily_bonus(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_daily_bonus(uuid, boolean) TO authenticated, service_role;

DO $$
DECLARE
  _fn text;
BEGIN
  SELECT pg_get_functiondef('public.settle_daily_bonus(uuid, boolean)'::regprocedure)
    INTO _fn;

  IF position('b.bonus_type IN (''referral'',''repurchase'',''rank_rebate'')' in _fn) > 0 THEN
    RAISE EXCEPTION 'settle_daily_bonus still includes rank_rebate in daily pending whitelist';
  END IF;

  IF position('b.bonus_type IN (''referral'',''repurchase'')' in _fn) = 0 THEN
    RAISE EXCEPTION 'settle_daily_bonus does not contain expected daily pending whitelist';
  END IF;
END;
$$;
