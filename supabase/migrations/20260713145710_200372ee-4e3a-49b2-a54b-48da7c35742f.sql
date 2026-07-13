-- Add daily settlement calculation_detail snapshots without changing bonus formulas.

ALTER TABLE public.bonus_records
  ADD COLUMN IF NOT EXISTS calculation_detail jsonb;

CREATE INDEX IF NOT EXISTS idx_bonus_records_daily_calculation_detail
  ON public.bonus_records USING gin (calculation_detail)
  WHERE bonus_type IN ('referral', 'repurchase')
    AND calculation_detail IS NOT NULL;

CREATE OR REPLACE FUNCTION public.settle_daily_bonus(
  _created_by uuid DEFAULT NULL,
  _advance_next boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _s public.bonus_settings;
  _today date := (now() AT TIME ZONE 'Asia/Taipei')::date;
  _ym text := to_char((now() AT TIME ZONE 'Asia/Taipei')::date, 'YYYYMM');
  _release_date date;
  _batch_id uuid;
  _eligible_count int := 0;
  _cancelled_count int := 0;
  _total_points int := 0;
  _members int := 0;
  _uid uuid := auth.uid();
BEGIN
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

  CREATE TEMP TABLE IF NOT EXISTS daily_bonus_pending (
    id uuid PRIMARY KEY,
    member_id uuid,
    bonus_points integer,
    bonus_type text,
    eligible boolean,
    block_reason text,
    recipient_is_vip boolean,
    recipient_vip_expires_at timestamptz,
    responsibility_points numeric,
    responsibility_required_points numeric
  ) ON COMMIT DROP;
  TRUNCATE daily_bonus_pending;

  INSERT INTO daily_bonus_pending (
    id,
    member_id,
    bonus_points,
    bonus_type,
    eligible,
    block_reason,
    recipient_is_vip,
    recipient_vip_expires_at,
    responsibility_points,
    responsibility_required_points
  )
  SELECT
    b.id,
    b.member_id,
    COALESCE(b.bonus_points, 0),
    b.bonus_type,
    CASE
      WHEN p.id IS NULL THEN false
      WHEN COALESCE(p.is_vip, false) IS NOT true THEN false
      WHEN p.vip_expires_at IS NULL THEN false
      WHEN p.vip_expires_at::date < _release_date THEN false
      WHEN b.bonus_type = 'repurchase'
        AND COALESCE(mrp.points, 0) < COALESCE(rr.required_points, _s.vip_required_points, 0) THEN false
      ELSE true
    END AS eligible,
    CASE
      WHEN p.id IS NULL THEN 'recipient profile missing'
      WHEN COALESCE(p.is_vip, false) IS NOT true THEN 'recipient is not VIP'
      WHEN p.vip_expires_at IS NULL THEN 'VIP expiry missing; treated as expired'
      WHEN p.vip_expires_at::date < _release_date THEN 'VIP expired before reward release date'
      WHEN b.bonus_type = 'repurchase'
        AND COALESCE(mrp.points, 0) < COALESCE(rr.required_points, _s.vip_required_points, 0)
        THEN format(
          'monthly responsibility not completed: %s/%s',
          COALESCE(mrp.points, 0),
          COALESCE(rr.required_points, _s.vip_required_points, 0)
        )
      ELSE NULL
    END AS block_reason,
    COALESCE(p.is_vip, false) AS recipient_is_vip,
    p.vip_expires_at AS recipient_vip_expires_at,
    COALESCE(mrp.points, 0) AS responsibility_points,
    COALESCE(rr.required_points, _s.vip_required_points, 0) AS responsibility_required_points
  FROM public.bonus_records b
  LEFT JOIN public.profiles p ON p.id = b.member_id
  LEFT JOIN public.rank_rebate_settings rr
    ON rr.enabled = true
   AND rr.rank_code = public.map_legacy_rank_to_code(p.legacy_rank)
  LEFT JOIN public.monthly_responsibility_points mrp
    ON mrp.member_id = b.member_id
   AND mrp.ym = _ym
  WHERE b.status = 'pending'
    AND b.bonus_type IN ('referral','repurchase','rank_rebate')
  ORDER BY b.created_at
  LIMIT 5000
  FOR UPDATE OF b SKIP LOCKED;

  UPDATE public.bonus_records b
     SET status = 'cancelled',
         bonus_points = 0,
         required_points_checked = true,
         required_points_passed = false,
         fail_reason = p.block_reason,
         settlement_date = _today,
         release_date = NULL,
         calculation_detail = COALESCE(b.calculation_detail, '{}'::jsonb) || jsonb_build_object(
           'schema_version', 1,
           'daily_settlement', jsonb_build_object(
             'settlement_date', _today,
             'release_date', NULL,
             'eligible', false,
             'block_reason', p.block_reason,
             'responsibility_points', p.responsibility_points,
             'responsibility_required_points', p.responsibility_required_points,
             'recipient_vip_snapshot', jsonb_build_object(
               'is_vip', p.recipient_is_vip,
               'vip_expires_at', p.recipient_vip_expires_at,
               'valid_at_release_date', false
             )
           ),
           'settlement_date', _today,
           'release_date', NULL,
           'eligible_at_daily_settlement', false,
           'block_reason', p.block_reason
         ),
         updated_at = now()
  FROM daily_bonus_pending p
  WHERE b.id = p.id
    AND p.eligible = false;

  GET DIAGNOSTICS _cancelled_count = ROW_COUNT;

  SELECT count(*), count(DISTINCT member_id), COALESCE(sum(bonus_points), 0)::int
    INTO _eligible_count, _members, _total_points
  FROM daily_bonus_pending
  WHERE eligible = true;

  IF _eligible_count > 0 THEN
    INSERT INTO public.bonus_settlement_batches(
      settlement_type, settlement_period_start, settlement_period_end,
      total_members, total_bonus_points, status, created_by
    ) VALUES (
      'daily', _today, _today, _members, _total_points, 'processing', _created_by
    ) RETURNING id INTO _batch_id;

    UPDATE public.bonus_records b
      SET status = 'waiting_release',
          settlement_batch_id = _batch_id,
          settlement_date = _today,
          release_date = _release_date,
          required_points_checked = true,
          required_points_passed = true,
          fail_reason = NULL,
          calculation_detail = COALESCE(b.calculation_detail, '{}'::jsonb) || jsonb_build_object(
            'schema_version', 1,
            'daily_settlement', jsonb_build_object(
              'settlement_batch_id', _batch_id,
              'settlement_date', _today,
              'release_date', _release_date,
              'eligible', true,
              'block_reason', NULL,
              'responsibility_points', p.responsibility_points,
              'responsibility_required_points', p.responsibility_required_points,
              'recipient_vip_snapshot', jsonb_build_object(
                'is_vip', p.recipient_is_vip,
                'vip_expires_at', p.recipient_vip_expires_at,
                'valid_at_release_date', true
              )
            ),
            'settlement_batch_id', _batch_id,
            'settlement_date', _today,
            'release_date', _release_date,
            'eligible_at_daily_settlement', true,
            'block_reason', NULL
          ),
          updated_at = now()
    FROM daily_bonus_pending p
    WHERE b.id = p.id
      AND p.eligible = true;

    UPDATE public.bonus_settlement_batches
      SET status = 'completed', completed_at = now()
    WHERE id = _batch_id;
  END IF;

  IF _advance_next THEN
    UPDATE public.bonus_settings
      SET daily_next_settlement_at = now() + (_s.daily_bonus_cycle_days || ' days')::interval
      WHERE id = _s.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'count', _eligible_count,
    'cancelled', _cancelled_count,
    'batch_id', _batch_id,
    'points', _total_points,
    'release_date', _release_date
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_daily_bonus(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_daily_bonus(uuid, boolean) TO authenticated, service_role;