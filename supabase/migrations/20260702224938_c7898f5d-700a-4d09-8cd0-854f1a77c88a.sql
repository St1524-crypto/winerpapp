
CREATE OR REPLACE FUNCTION public.settle_daily_bonus(
  _created_by uuid DEFAULT NULL,
  _advance_next boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _s public.bonus_settings;
  _today date := (now() AT TIME ZONE 'Asia/Taipei')::date;
  _release_date date;
  _batch_id uuid;
  _ids uuid[];
  _total_points int := 0;
  _members int := 0;
  _count int := 0;
  _uid uuid := auth.uid();
BEGIN
  -- Authorization (skip when invoked via service_role)
  IF _uid IS NOT NULL
     AND NOT (
        private.has_role(_uid, 'super_admin'::app_role)
        OR private.has_role(_uid, 'admin'::app_role)
        OR private.has_role(_uid, 'finance'::app_role)
     ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT * INTO _s FROM public.bonus_settings ORDER BY created_at LIMIT 1;
  IF _s.id IS NULL THEN
    RAISE EXCEPTION 'bonus_settings not initialised';
  END IF;

  _release_date := _today + (_s.reward_release_days || ' days')::interval;

  SELECT COALESCE(array_agg(id), '{}'::uuid[]),
         COALESCE(SUM(bonus_points), 0),
         COUNT(DISTINCT member_id)
    INTO _ids, _total_points, _members
  FROM public.bonus_records
  WHERE status = 'pending'
    AND bonus_type IN ('referral','repurchase','rank_rebate');

  _count := COALESCE(array_length(_ids, 1), 0);

  IF _count = 0 THEN
    IF _advance_next THEN
      UPDATE public.bonus_settings
        SET daily_next_settlement_at = now() + (_s.daily_bonus_cycle_days || ' days')::interval
        WHERE id = _s.id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'count', 0, 'batch_id', null, 'points', 0);
  END IF;

  INSERT INTO public.bonus_settlement_batches(
    settlement_type, settlement_period_start, settlement_period_end,
    total_members, total_bonus_points, status, created_by
  ) VALUES (
    'daily', _today, _today, _members, _total_points, 'processing', _created_by
  ) RETURNING id INTO _batch_id;

  UPDATE public.bonus_records
    SET status = 'waiting_release',
        settlement_batch_id = _batch_id,
        settlement_date = _today,
        release_date = _release_date,
        updated_at = now()
  WHERE id = ANY(_ids);

  UPDATE public.bonus_settlement_batches
    SET status = 'completed', completed_at = now()
  WHERE id = _batch_id;

  IF _advance_next THEN
    UPDATE public.bonus_settings
      SET daily_next_settlement_at = now() + (_s.daily_bonus_cycle_days || ' days')::interval
      WHERE id = _s.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'count', _count,
    'batch_id', _batch_id,
    'points', _total_points,
    'release_date', _release_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_daily_bonus(uuid, boolean) TO authenticated, service_role;
