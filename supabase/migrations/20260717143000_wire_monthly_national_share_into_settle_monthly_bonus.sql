-- Batch 3C: Wire monthly national share into the existing monthly settlement RPC.
-- Scope: function definition only. This migration does not execute settlement and
-- does not modify bonus_records, wallet, reward_wallet_logs, or point_transactions.

DO $$
DECLARE
  _fn text;
  _patched text;
  _needle text;
  _replacement text;
BEGIN
  SELECT pg_get_functiondef('public.settle_monthly_bonus(text, uuid, text)'::regprocedure)
    INTO _fn;

  IF _fn IS NULL THEN
    RAISE EXCEPTION 'public.settle_monthly_bonus(text, uuid, text) was not found';
  END IF;

  IF position('settle_monthly_national_share' in _fn) > 0 THEN
    RAISE NOTICE 'settle_monthly_bonus already calls settle_monthly_national_share; skipping patch';
    RETURN;
  END IF;

  _patched := _fn;

  _needle := '  _hop int;';
  _replacement := '  _hop int;
  _national_result jsonb := NULL;
  _national_points int := 0;';
  IF position(_needle in _patched) = 0 THEN
    RAISE EXCEPTION 'Unable to patch settle_monthly_bonus: declaration anchor not found';
  END IF;
  _patched := replace(_patched, _needle, _replacement);

  _needle := '  UPDATE public.bonus_settlement_batches
    SET status = ''completed'', completed_at = now(),
        total_members = _members, total_bonus_points = _total_pts
    WHERE id = _batch_id;';
  _replacement := '  -- National share is a monthly bonus in v3. It shares the same settlement batch.
  _national_result := public.settle_monthly_national_share(
    _ym,
    _created_by,
    ''monthly_settlement'',
    _batch_id,
    false
  );

  SELECT COALESCE(SUM((tier_item->>''distributed_points'')::numeric), 0)::int
    INTO _national_points
  FROM jsonb_array_elements(COALESCE(_national_result->''tiers'', ''[]''::jsonb)) AS tier_item;

  _total_pts := _total_pts + COALESCE(_national_points, 0);

  UPDATE public.bonus_settlement_batches
    SET status = ''completed'', completed_at = now(),
        total_members = _members, total_bonus_points = _total_pts
    WHERE id = _batch_id;';
  IF position(_needle in _patched) = 0 THEN
    RAISE EXCEPTION 'Unable to patch settle_monthly_bonus: completion anchor not found';
  END IF;
  _patched := replace(_patched, _needle, _replacement);

  _needle := '    ''release_date'', _release_date,
    ''source'', _source';
  _replacement := '    ''release_date'', _release_date,
    ''national_share'', _national_result,
    ''national_share_points'', COALESCE(_national_points, 0),
    ''source'', _source';
  IF position(_needle in _patched) = 0 THEN
    RAISE EXCEPTION 'Unable to patch settle_monthly_bonus: return anchor not found';
  END IF;
  _patched := replace(_patched, _needle, _replacement);

  EXECUTE _patched;
END $$;

REVOKE EXECUTE ON FUNCTION public.settle_monthly_bonus(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_monthly_bonus(text, uuid, text) TO authenticated, service_role;

DO $$
DECLARE
  _fn text;
BEGIN
  SELECT pg_get_functiondef('public.settle_monthly_bonus(text, uuid, text)'::regprocedure)
    INTO _fn;

  IF position('public.settle_monthly_national_share(' in _fn) = 0 THEN
    RAISE EXCEPTION 'Verification failed: settle_monthly_bonus does not call settle_monthly_national_share';
  END IF;

  IF position('''monthly_settlement''' in _fn) = 0 THEN
    RAISE EXCEPTION 'Verification failed: monthly_settlement source not found in settle_monthly_bonus';
  END IF;

  IF position('_batch_id' in _fn) = 0 THEN
    RAISE EXCEPTION 'Verification failed: batch_id not found in settle_monthly_bonus';
  END IF;
END $$;
