-- Fix effective VIP tier helper to use dealer_tier_status.user_id.
--
-- Problem:
--   private.get_effective_vip_tier() queried dealer_tier_status.member_id,
--   but the table schema uses user_id. This made daily settlement fail with:
--   column "member_id" does not exist.
--
-- Safety:
--   - Function definition only.
--   - No settlement execution.
--   - No bonus_records, wallet, reward_wallet_logs, or point_transactions writes.

CREATE OR REPLACE FUNCTION private.get_effective_vip_tier(_member_id uuid, _on date)
RETURNS TABLE(legacy_code text, vip_tier_code text, pool_ordinal text, effective_from date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _current text;
BEGIN
  SELECT current_tier INTO _current
  FROM public.dealer_tier_status
  WHERE user_id = _member_id
  LIMIT 1;

  IF _current IS NULL THEN
    RETURN;
  END IF;

  IF _current IN ('V','S','T','E','A','STAR1','STAR2','STAR3','STAR4','STAR5','STAR6','STAR7','DIRECTOR') THEN
    RETURN QUERY
      SELECT _current::text,
             _current::text,
             m.pool_ordinal,
             COALESCE(m.effective_from, '2026-07-16'::date)
      FROM public.tier_code_mapping m
      WHERE m.legacy_code = _current AND m.is_active = true
      UNION ALL
      SELECT _current::text, _current::text, NULL::text, '2026-07-16'::date
      WHERE NOT EXISTS (SELECT 1 FROM public.tier_code_mapping m2 WHERE m2.legacy_code = _current)
      LIMIT 1;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT m.legacy_code, m.vip_tier_code, m.pool_ordinal, m.effective_from
    FROM public.tier_code_mapping m
    WHERE m.legacy_code = _current AND m.is_active = true
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION private.get_effective_vip_tier(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_effective_vip_tier(uuid, date) TO authenticated, service_role;

DO $$
DECLARE
  _fn text;
BEGIN
  SELECT pg_get_functiondef('private.get_effective_vip_tier(uuid, date)'::regprocedure)
    INTO _fn;

  IF _fn IS NULL THEN
    RAISE EXCEPTION 'Verification failed: private.get_effective_vip_tier(uuid, date) does not exist';
  END IF;

  IF position('WHERE user_id = _member_id' in _fn) = 0 THEN
    RAISE EXCEPTION 'Verification failed: helper does not use dealer_tier_status.user_id';
  END IF;

  IF position('WHERE member_id = _member_id' in _fn) > 0 THEN
    RAISE EXCEPTION 'Verification failed: helper still references dealer_tier_status.member_id';
  END IF;
END;
$$;
