-- Move bonus settlement and reward wallet release into transactional DB RPCs.

CREATE OR REPLACE FUNCTION public.settle_daily_bonus(
  _created_by uuid DEFAULT NULL,
  _advance_next boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.bonus_settings%ROWTYPE;
  v_today date := CURRENT_DATE;
  v_release_date date;
  v_batch_id uuid;
  v_count integer := 0;
  v_members integer := 0;
  v_points integer := 0;
BEGIN
  SELECT * INTO v_settings
  FROM public.bonus_settings
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bonus_settings not found';
  END IF;

  v_release_date := v_today + v_settings.reward_release_days;

  WITH pending AS (
    SELECT id, member_id, bonus_points
    FROM public.bonus_records
    WHERE bonus_type IN ('referral', 'repurchase', 'rank_rebate')
      AND status = 'pending'
    ORDER BY created_at
    LIMIT 5000
    FOR UPDATE SKIP LOCKED
  )
  SELECT count(*), count(DISTINCT member_id), COALESCE(sum(bonus_points), 0)::integer
  INTO v_count, v_members, v_points
  FROM pending;

  IF v_count > 0 THEN
    INSERT INTO public.bonus_settlement_batches (
      settlement_type,
      settlement_period_start,
      settlement_period_end,
      total_members,
      total_bonus_points,
      status,
      completed_at,
      created_by,
      notes
    )
    VALUES (
      'daily',
      v_today,
      v_today,
      v_members,
      v_points,
      'completed',
      now(),
      _created_by,
      'rpc daily settlement'
    )
    RETURNING id INTO v_batch_id;

    WITH pending AS (
      SELECT id
      FROM public.bonus_records
      WHERE bonus_type IN ('referral', 'repurchase', 'rank_rebate')
        AND status = 'pending'
      ORDER BY created_at
      LIMIT 5000
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.bonus_records b
    SET
      status = 'waiting_release',
      settlement_batch_id = v_batch_id,
      settlement_date = v_today,
      release_date = v_release_date
    FROM pending p
    WHERE b.id = p.id;
  END IF;

  IF _advance_next THEN
    UPDATE public.bonus_settings
    SET daily_next_settlement_at = now() + make_interval(days => v_settings.daily_bonus_cycle_days)
    WHERE id = v_settings.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'batch_id', v_batch_id,
    'points', v_points
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_bonus_rewards(
  _record_ids uuid[] DEFAULT NULL,
  _limit integer DEFAULT 2000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record record;
  v_after integer;
  v_released integer := 0;
  v_points integer := 0;
BEGIN
  FOR v_record IN
    SELECT id, member_id, bonus_points, bonus_type
    FROM public.bonus_records
    WHERE status = 'waiting_release'
      AND (
        (_record_ids IS NULL AND release_date <= CURRENT_DATE)
        OR (_record_ids IS NOT NULL AND id = ANY(_record_ids))
      )
    ORDER BY release_date NULLS LAST, created_at
    LIMIT COALESCE(_limit, 2000)
    FOR UPDATE SKIP LOCKED
  LOOP
    IF COALESCE(v_record.bonus_points, 0) > 0 THEN
      INSERT INTO public.member_points_wallet (user_id)
      VALUES (v_record.member_id)
      ON CONFLICT (user_id) DO NOTHING;

      UPDATE public.member_points_wallet
      SET
        reward_points = reward_points + v_record.bonus_points,
        updated_at = now()
      WHERE user_id = v_record.member_id
      RETURNING reward_points INTO v_after;

      INSERT INTO public.point_transactions (
        user_id,
        point_type,
        amount,
        balance_after,
        source,
        reference_id,
        note
      )
      VALUES (
        v_record.member_id,
        'reward',
        v_record.bonus_points,
        v_after,
        'bonus_' || v_record.bonus_type,
        v_record.id,
        'bonus reward release'
      );

      INSERT INTO public.reward_wallet_logs (
        member_id,
        bonus_record_id,
        points,
        type,
        status,
        description
      )
      VALUES (
        v_record.member_id,
        v_record.id,
        v_record.bonus_points,
        'earn',
        'success',
        'rpc release'
      );

      v_points := v_points + v_record.bonus_points;
    END IF;

    UPDATE public.bonus_records
    SET
      status = 'released',
      released_at = now()
    WHERE id = v_record.id;

    v_released := v_released + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'released', v_released,
    'points', v_points
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_monthly_bonus(
  _yyyymm text DEFAULT NULL,
  _created_by uuid DEFAULT NULL,
  _source text DEFAULT 'admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.bonus_settings%ROWTYPE;
  v_ym text;
  v_year integer;
  v_month integer;
  v_start date;
  v_end date;
  v_release_date date;
  v_existing public.bonus_settlement_batches%ROWTYPE;
  v_batch_id uuid;
  v_vip record;
  v_rule record;
  v_self_points numeric;
  v_first_gen_points numeric;
  v_total_base numeric;
  v_required numeric;
  v_passed boolean;
  v_tier_rate numeric;
  v_bonus_points integer;
  v_excess numeric;
  v_rebate integer;
  v_granted integer := 0;
  v_total_points integer := 0;
BEGIN
  v_ym := COALESCE(_yyyymm, to_char(CURRENT_DATE, 'YYYYMM'));
  IF v_ym !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'Invalid settlement month';
  END IF;

  v_year := substring(v_ym from 1 for 4)::integer;
  v_month := substring(v_ym from 5 for 2)::integer;
  IF v_month < 1 OR v_month > 12 THEN
    RAISE EXCEPTION 'Invalid settlement month';
  END IF;

  v_start := make_date(v_year, v_month, 1);
  v_end := (v_start + interval '1 month - 1 day')::date;

  SELECT * INTO v_existing
  FROM public.bonus_settlement_batches
  WHERE settlement_type = 'monthly'
    AND settlement_period_start = v_start
    AND settlement_period_end = v_end
    AND status IN ('processing', 'completed')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', CASE WHEN v_existing.status = 'completed' THEN 'already_settled' ELSE 'already_processing' END,
      'yyyymm', v_ym,
      'count', COALESCE(v_existing.total_members, 0),
      'points', COALESCE(v_existing.total_bonus_points, 0),
      'batch_id', v_existing.id
    );
  END IF;

  SELECT * INTO v_settings
  FROM public.bonus_settings
  ORDER BY created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bonus_settings not found';
  END IF;

  v_release_date := v_end + v_settings.reward_release_days;

  SELECT * INTO v_rule
  FROM public.rank_rebate_settings
  WHERE enabled = true
  ORDER BY sort_order
  LIMIT 1;

  INSERT INTO public.bonus_settlement_batches (
    settlement_type,
    settlement_period_start,
    settlement_period_end,
    status,
    created_by,
    notes
  )
  VALUES (
    'monthly',
    v_start,
    v_end,
    'processing',
    _created_by,
    COALESCE(_source, 'admin') || ' monthly settlement ' || v_ym
  )
  RETURNING id INTO v_batch_id;

  BEGIN
    FOR v_vip IN
      SELECT id
      FROM public.profiles
      WHERE is_vip = true
        AND (vip_expires_at IS NULL OR vip_expires_at >= (v_end::timestamptz + interval '1 day' - interval '1 second'))
      ORDER BY id
    LOOP
      SELECT COALESCE(points, 0) INTO v_self_points
      FROM public.monthly_responsibility_points
      WHERE member_id = v_vip.id
        AND ym = v_ym;
      v_self_points := COALESCE(v_self_points, 0);

      SELECT COALESCE(sum(mrp.points), 0) INTO v_first_gen_points
      FROM public.profiles child
      LEFT JOIN public.monthly_responsibility_points mrp
        ON mrp.member_id = child.id
       AND mrp.ym = v_ym
      WHERE child.referred_by = v_vip.id;
      v_first_gen_points := COALESCE(v_first_gen_points, 0);

      v_total_base := v_self_points + v_first_gen_points;
      v_required := COALESCE(v_rule.required_points, v_settings.vip_required_points, 200);
      v_passed := v_total_base >= v_required;

      SELECT COALESCE(max(bonus_rate), 0) INTO v_tier_rate
      FROM public.monthly_tier_bonus_settings
      WHERE enabled = true
        AND threshold_points <= v_total_base;

      IF NOT v_passed THEN
        v_tier_rate := 0;
      END IF;

      v_bonus_points := CASE
        WHEN v_passed AND v_tier_rate > 0 THEN floor(v_total_base * v_tier_rate / 100)::integer
        ELSE 0
      END;

      INSERT INTO public.bonus_records (
        member_id,
        bonus_type,
        base_amount,
        bonus_rate,
        bonus_points,
        required_points_checked,
        required_points_passed,
        fail_reason,
        status,
        settlement_batch_id,
        settlement_date,
        release_date
      )
      VALUES (
        v_vip.id,
        'monthly_vip',
        v_total_base,
        v_tier_rate,
        v_bonus_points,
        true,
        v_passed,
        CASE
          WHEN v_passed AND v_tier_rate = 0 THEN 'No monthly tier matched (' || v_total_base || ')'
          WHEN NOT v_passed THEN 'Monthly responsibility not met: ' || v_total_base || '/' || v_required
          ELSE NULL
        END,
        CASE WHEN v_passed AND v_bonus_points > 0 THEN 'waiting_release' ELSE 'cancelled' END,
        v_batch_id,
        v_end,
        CASE WHEN v_passed AND v_bonus_points > 0 THEN v_release_date ELSE NULL END
      );

      IF v_passed AND v_bonus_points > 0 THEN
        v_granted := v_granted + 1;
        v_total_points := v_total_points + v_bonus_points;
      END IF;

      IF v_passed
         AND v_rule IS NOT NULL
         AND v_self_points > v_required
         AND COALESCE(v_rule.exceeded_rebate_rate, 0) > 0 THEN
        v_excess := v_self_points - v_required;
        v_rebate := floor(v_excess * v_rule.exceeded_rebate_rate / 100)::integer;

        IF v_rebate > 0 THEN
          INSERT INTO public.bonus_records (
            member_id,
            bonus_type,
            base_amount,
            bonus_rate,
            bonus_points,
            required_points_checked,
            required_points_passed,
            status,
            settlement_batch_id,
            settlement_date,
            release_date
          )
          VALUES (
            v_vip.id,
            'rank_rebate',
            v_excess,
            v_rule.exceeded_rebate_rate,
            v_rebate,
            true,
            true,
            'waiting_release',
            v_batch_id,
            v_end,
            v_release_date
          );

          v_granted := v_granted + 1;
          v_total_points := v_total_points + v_rebate;
        END IF;
      END IF;
    END LOOP;

    UPDATE public.bonus_settlement_batches
    SET
      status = 'completed',
      completed_at = now(),
      total_members = v_granted,
      total_bonus_points = v_total_points
    WHERE id = v_batch_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.bonus_settlement_batches
    SET
      status = 'failed',
      completed_at = now(),
      notes = COALESCE(_source, 'admin') || ' monthly settlement ' || v_ym || ' failed: ' || SQLERRM
    WHERE id = v_batch_id;
    RAISE;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'skipped', false,
    'yyyymm', v_ym,
    'count', v_granted,
    'batch_id', v_batch_id,
    'points', v_total_points
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_daily_bonus(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_bonus_rewards(uuid[], integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_monthly_bonus(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_daily_bonus(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_bonus_rewards(uuid[], integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_monthly_bonus(text, uuid, text) TO service_role;
