-- Align daily bonus next settlement time to 19:00:00 UTC.
DO $$
DECLARE
  _fn text;
  _before text := 'daily_next_settlement_at = now() + (_s.daily_bonus_cycle_days || '' days'')::interval';
  _after text := 'daily_next_settlement_at = (((now() AT TIME ZONE ''UTC'')::date + GREATEST(COALESCE(_s.daily_bonus_cycle_days, 1), 1) + time ''19:00'') AT TIME ZONE ''UTC'')';
BEGIN
  SELECT pg_get_functiondef('public.settle_daily_bonus(uuid, boolean)'::regprocedure)
    INTO _fn;

  IF _fn IS NULL THEN
    RAISE EXCEPTION 'public.settle_daily_bonus(uuid, boolean) does not exist';
  END IF;

  IF position(_after in _fn) > 0 THEN
    RAISE NOTICE 'settle_daily_bonus already aligns daily_next_settlement_at to 19:00 UTC';
    RETURN;
  END IF;

  IF position(_before in _fn) = 0 THEN
    RAISE EXCEPTION 'settle_daily_bonus next settlement expression did not match expected text';
  END IF;

  _fn := replace(_fn, _before, _after);
  EXECUTE _fn;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_daily_bonus(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_daily_bonus(uuid, boolean) TO authenticated, service_role;

DO $$
DECLARE
  _fn text;
  _old text := 'daily_next_settlement_at = now() + (_s.daily_bonus_cycle_days || '' days'')::interval';
  _new text := 'daily_next_settlement_at = (((now() AT TIME ZONE ''UTC'')::date + GREATEST(COALESCE(_s.daily_bonus_cycle_days, 1), 1) + time ''19:00'') AT TIME ZONE ''UTC'')';
BEGIN
  SELECT pg_get_functiondef('public.settle_daily_bonus(uuid, boolean)'::regprocedure)
    INTO _fn;

  IF position(_old in _fn) > 0 THEN
    RAISE EXCEPTION 'Verification failed: old drifting daily_next_settlement_at expression still exists';
  END IF;

  IF position(_new in _fn) = 0 THEN
    RAISE EXCEPTION 'Verification failed: aligned daily_next_settlement_at expression not found';
  END IF;
END;
$$;