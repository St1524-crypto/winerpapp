-- Fix monthly national-share settlement tier lookup (dealer_tier_status.user_id)
DO $$
DECLARE
  _fn text;
BEGIN
  SELECT pg_get_functiondef('public.settle_monthly_national_share(text, uuid, text, uuid, boolean)'::regprocedure)
    INTO _fn;

  IF _fn IS NULL THEN
    RAISE EXCEPTION 'public.settle_monthly_national_share(text, uuid, text, uuid, boolean) does not exist';
  END IF;

  IF position('s.member_id' in _fn) = 0 THEN
    RAISE NOTICE 'settle_monthly_national_share already uses dealer_tier_status.user_id; skipping patch';
    RETURN;
  END IF;

  _fn := replace(_fn, 'SELECT s.member_id, ev.legacy_code', 'SELECT s.user_id, ev.legacy_code');
  _fn := replace(_fn, 'private.get_effective_vip_tier(s.member_id, _period_end)', 'private.get_effective_vip_tier(s.user_id, _period_end)');
  _fn := replace(_fn, 'p.id = s.member_id', 'p.id = s.user_id');

  EXECUTE _fn;
END $$;

REVOKE EXECUTE ON FUNCTION public.settle_monthly_national_share(text, uuid, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_monthly_national_share(text, uuid, text, uuid, boolean) TO authenticated, service_role;

DO $$
DECLARE
  _fn text;
BEGIN
  SELECT pg_get_functiondef('public.settle_monthly_national_share(text, uuid, text, uuid, boolean)'::regprocedure)
    INTO _fn;

  IF position('s.member_id' in _fn) > 0 THEN
    RAISE EXCEPTION 'Verification failed: settle_monthly_national_share still references dealer_tier_status.member_id alias';
  END IF;
  IF position('SELECT s.user_id, ev.legacy_code' in _fn) = 0 THEN
    RAISE EXCEPTION 'Verification failed: candidate insert does not select dealer_tier_status.user_id';
  END IF;
  IF position('private.get_effective_vip_tier(s.user_id, _period_end)' in _fn) = 0 THEN
    RAISE EXCEPTION 'Verification failed: effective tier lookup does not use dealer_tier_status.user_id';
  END IF;
  IF position('p.id = s.user_id' in _fn) = 0 THEN
    RAISE EXCEPTION 'Verification failed: profile join does not use dealer_tier_status.user_id';
  END IF;
  IF position('member_points_wallet' in _fn) > 0
     OR position('reward_wallet_logs' in _fn) > 0
     OR position('point_transactions' in _fn) = 0 THEN
    RAISE EXCEPTION 'Verification failed: unexpected wallet/ledger references changed';
  END IF;
END $$;