-- fix(bonus): qualify vip bonus pool payout idempotency lookup
DO $$
DECLARE
  _fn text;
  _patched text;
BEGIN
  SELECT pg_get_functiondef('public.distribute_vip_bonus_pool_daily(uuid, date, numeric)'::regprocedure)
  INTO _fn;

  IF _fn IS NULL THEN
    RAISE EXCEPTION 'public.distribute_vip_bonus_pool_daily(uuid, date, numeric) does not exist';
  END IF;

  _patched := replace(
    _fn,
    E'      SELECT 1 FROM public.vip_bonus_pool_payouts\n      WHERE pool_id = _pool_id\n        AND payout_date = _settlement_date\n        AND member_id = _member.member_id',
    E'      SELECT 1 FROM public.vip_bonus_pool_payouts p\n      WHERE p.pool_id = _pool_id\n        AND p.payout_date = _settlement_date\n        AND p.member_id = _member.member_id'
  );

  IF _patched = _fn THEN
    IF position('public.vip_bonus_pool_payouts p' in _fn) > 0
       AND position('p.pool_id = _pool_id' in _fn) > 0 THEN
      RAISE NOTICE 'distribute_vip_bonus_pool_daily already uses qualified payout alias; skipping patch';
      RETURN;
    END IF;
    RAISE EXCEPTION 'Unable to patch distribute_vip_bonus_pool_daily idempotency query';
  END IF;

  EXECUTE _patched;
END $$;

REVOKE EXECUTE ON FUNCTION public.distribute_vip_bonus_pool_daily(uuid, date, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_vip_bonus_pool_daily(uuid, date, numeric) TO service_role;

DO $$
DECLARE
  _fn text;
BEGIN
  SELECT pg_get_functiondef('public.distribute_vip_bonus_pool_daily(uuid, date, numeric)'::regprocedure)
  INTO _fn;

  IF position('public.vip_bonus_pool_payouts p' in _fn) = 0 THEN
    RAISE EXCEPTION 'Verification failed: vip_bonus_pool_payouts alias p not found';
  END IF;
  IF position('p.pool_id = _pool_id' in _fn) = 0 THEN
    RAISE EXCEPTION 'Verification failed: qualified p.pool_id idempotency predicate not found';
  END IF;
  IF position('p.payout_date = _settlement_date' in _fn) = 0 THEN
    RAISE EXCEPTION 'Verification failed: qualified p.payout_date idempotency predicate not found';
  END IF;
  IF position('p.member_id = _member.member_id' in _fn) = 0 THEN
    RAISE EXCEPTION 'Verification failed: qualified p.member_id idempotency predicate not found';
  END IF;
  IF position(E'WHERE pool_id = _pool_id' in _fn) > 0 THEN
    RAISE EXCEPTION 'Verification failed: unqualified pool_id predicate remains';
  END IF;
END $$;