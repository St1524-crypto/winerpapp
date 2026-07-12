-- Harden bonus reward basis and VIP expiry eligibility.
-- Rules:
-- 1) VIP must have vip_expires_at and it must cover the release/check date.
-- 2) Repurchase bonus recipients must complete monthly responsibility before daily settlement.
-- 3) Monthly settlement only grants to active VIPs; null vip_expires_at is expired.

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
    block_reason text
  ) ON COMMIT DROP;
  TRUNCATE daily_bonus_pending;

  INSERT INTO daily_bonus_pending (id, member_id, bonus_points, bonus_type, eligible, block_reason)
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
    END AS block_reason
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

CREATE OR REPLACE FUNCTION public.resolve_bonus_reward_recipient(_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current uuid := _member_id;
  v_profile record;
  v_path uuid[] := ARRAY[]::uuid[];
  v_reason text := 'original_valid_vip';
  v_redirected boolean := false;
  v_step integer := 0;
BEGIN
  IF _member_id IS NULL THEN
    RETURN jsonb_build_object(
      'recipient_id', null,
      'original_member_id', _member_id,
      'redirected', false,
      'reason', 'missing_member_id',
      'path', to_jsonb(v_path)
    );
  END IF;

  WHILE v_current IS NOT NULL AND v_step < 20 LOOP
    IF v_current = ANY(v_path) THEN
      RETURN jsonb_build_object(
        'recipient_id', null,
        'original_member_id', _member_id,
        'redirected', v_redirected,
        'reason', 'referral_cycle_detected',
        'path', to_jsonb(v_path)
      );
    END IF;

    v_path := array_append(v_path, v_current);

    SELECT id, referred_by, is_vip, vip_expires_at, is_dealer
      INTO v_profile
    FROM public.profiles
    WHERE id = v_current;

    IF NOT FOUND THEN
      v_reason := 'profile_missing';
      v_current := NULL;
      EXIT;
    END IF;

    IF COALESCE(v_profile.is_dealer, false) THEN
      v_reason := 'dealer_redirected_to_valid_referrer';
    ELSIF COALESCE(v_profile.is_vip, false)
       AND v_profile.vip_expires_at IS NOT NULL
       AND v_profile.vip_expires_at::date >= CURRENT_DATE THEN
      RETURN jsonb_build_object(
        'recipient_id', v_profile.id,
        'original_member_id', _member_id,
        'redirected', v_redirected,
        'reason', CASE WHEN v_redirected THEN v_reason ELSE 'original_valid_vip' END,
        'path', to_jsonb(v_path)
      );
    ELSIF COALESCE(v_profile.is_vip, false)
       AND v_profile.vip_expires_at IS NULL THEN
      v_reason := 'missing_vip_expiry_redirected_to_valid_referrer';
    ELSIF COALESCE(v_profile.is_vip, false)
       AND v_profile.vip_expires_at::date < CURRENT_DATE THEN
      v_reason := 'expired_vip_redirected_to_valid_referrer';
    ELSE
      v_reason := 'non_vip_redirected_to_valid_referrer';
    END IF;

    v_redirected := true;
    v_current := v_profile.referred_by;
    v_step := v_step + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'recipient_id', null,
    'original_member_id', _member_id,
    'redirected', v_redirected,
    'reason', COALESCE(v_reason, 'no_valid_vip_referrer'),
    'path', to_jsonb(v_path)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_bonus_reward_recipient(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_bonus_reward_recipient(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_monthly_bonus(_yyyymm text DEFAULT NULL::text, _created_by uuid DEFAULT NULL::uuid, _source text DEFAULT 'admin'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _s public.bonus_settings;
  _uid uuid := auth.uid();
  _ym text;
  _year int;
  _month int;
  _period_start date;
  _period_end date;
  _settle_date date;
  _release_date date;
  _batch_id uuid;
  _member_rank public.rank_rebate_settings;
  _required int;
  _granted int := 0;
  _total_pts int := 0;
  _members int := 0;
  _vip record;
  _self_pts numeric;
  _first_gen_pts numeric;
  _total_base numeric;
  _tier_rate numeric;
  _bonus_pts int;
  _passed boolean;
  _excess numeric;
  _rebate int;
  _rank_code text;
  _current_id uuid;
  _up_id uuid;
  _up_rank public.rank_rebate_settings;
  _up_code text;
  _up_self_pts numeric;
  _max_rate numeric;
  _diff_rate numeric;
  _diff_pts int;
  _hop int;
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

  IF _yyyymm IS NULL THEN
    _ym := to_char((now() AT TIME ZONE 'Asia/Taipei')::date, 'YYYYMM');
  ELSE
    _ym := _yyyymm;
  END IF;
  _year := substring(_ym from 1 for 4)::int;
  _month := substring(_ym from 5 for 2)::int;
  _period_start := make_date(_year, _month, 1);
  _period_end := (_period_start + interval '1 month' - interval '1 day')::date;
  _settle_date := _period_end;
  _release_date := (_period_end + (_s.reward_release_days || ' days')::interval)::date;

  INSERT INTO public.bonus_settlement_batches(
    settlement_type, settlement_period_start, settlement_period_end,
    status, created_by, source
  ) VALUES (
    'monthly', _period_start, _period_end, 'running', _created_by, _source
  ) RETURNING id INTO _batch_id;

  FOR _vip IN
    SELECT p.id, p.legacy_rank, p.referred_by
      FROM public.profiles p
      WHERE p.is_vip = true
        AND p.vip_expires_at IS NOT NULL
        AND p.vip_expires_at::date >= _period_end
  LOOP
    _members := _members + 1;
    _rank_code := public.map_legacy_rank_to_code(_vip.legacy_rank);
    _member_rank := NULL;
    IF _rank_code IS NOT NULL THEN
      SELECT * INTO _member_rank
        FROM public.rank_rebate_settings
        WHERE enabled = true AND rank_code = _rank_code
        LIMIT 1;
    END IF;
    _required := COALESCE(_member_rank.required_points, _s.vip_required_points);

    SELECT COALESCE(points, 0) INTO _self_pts
      FROM public.monthly_responsibility_points
      WHERE member_id = _vip.id AND ym = _ym;
    _self_pts := COALESCE(_self_pts, 0);

    SELECT COALESCE(SUM(mrp.points), 0) INTO _first_gen_pts
      FROM public.profiles c
      LEFT JOIN public.monthly_responsibility_points mrp
        ON mrp.member_id = c.id AND mrp.ym = _ym
      WHERE c.referred_by = _vip.id;

    _total_base := _self_pts + _first_gen_pts;
    _passed := _total_base >= _required;

    _tier_rate := 0;
    IF _passed THEN
      SELECT COALESCE(bonus_rate, 0) INTO _tier_rate
        FROM public.monthly_tier_bonus_settings
        WHERE enabled = true AND threshold_points <= _total_base
        ORDER BY threshold_points DESC LIMIT 1;
      _tier_rate := COALESCE(_tier_rate, 0);
    END IF;

    _bonus_pts := CASE WHEN _tier_rate > 0 THEN floor(_total_base * _tier_rate / 100)::int ELSE 0 END;

    INSERT INTO public.bonus_records(
      member_id, bonus_type, base_amount, bonus_rate, bonus_points,
      required_points_checked, required_points_passed, fail_reason,
      status, settlement_batch_id, settlement_date, release_date
    ) VALUES (
      _vip.id, 'monthly_vip', _total_base, _tier_rate, _bonus_pts,
      true, _passed,
      CASE
        WHEN NOT _passed THEN format('monthly achievement not met: %s/%s', _total_base, _required)
        WHEN _tier_rate = 0 THEN format('no monthly bonus tier for base points %s', _total_base)
        ELSE NULL
      END,
      CASE WHEN _passed AND _bonus_pts > 0 THEN 'waiting_release' ELSE 'cancelled' END,
      _batch_id, _settle_date,
      CASE WHEN _passed AND _bonus_pts > 0 THEN _release_date ELSE NULL END
    );

    IF _passed AND _bonus_pts > 0 THEN
      _granted := _granted + 1;
      _total_pts := _total_pts + _bonus_pts;
    END IF;

    IF _self_pts > _required THEN
      _excess := _self_pts - _required;
      _max_rate := 0;

      IF _member_rank.id IS NOT NULL
         AND COALESCE(_member_rank.exceeded_rebate_rate, 0) > 0 THEN
        _rebate := floor(_excess * _member_rank.exceeded_rebate_rate / 100)::int;
        IF _rebate > 0 THEN
          INSERT INTO public.bonus_records(
            member_id, source_member_id, bonus_type, base_amount, bonus_rate, bonus_points,
            required_points_checked, required_points_passed,
            status, settlement_batch_id, settlement_date, release_date
          ) VALUES (
            _vip.id, _vip.id, 'rank_rebate', _excess, _member_rank.exceeded_rebate_rate, _rebate,
            true, true, 'waiting_release',
            _batch_id, _settle_date, _release_date
          );
          _total_pts := _total_pts + _rebate;
        END IF;
        _max_rate := _member_rank.exceeded_rebate_rate;
      END IF;

      _current_id := _vip.referred_by;
      _hop := 0;
      WHILE _current_id IS NOT NULL AND _max_rate < 50 AND _hop < 50 LOOP
        _hop := _hop + 1;

        SELECT
          referred_by,
          CASE
            WHEN is_vip = true
             AND vip_expires_at IS NOT NULL
             AND vip_expires_at::date >= _period_end
            THEN public.map_legacy_rank_to_code(legacy_rank)
            ELSE NULL
          END
          INTO _up_id, _up_code
          FROM public.profiles
          WHERE id = _current_id;

        _up_rank := NULL;
        IF _up_code IS NOT NULL THEN
          SELECT * INTO _up_rank
            FROM public.rank_rebate_settings
            WHERE enabled = true AND rank_code = _up_code
            LIMIT 1;
        END IF;

        IF _up_rank.id IS NOT NULL
           AND COALESCE(_up_rank.exceeded_rebate_rate, 0) > _max_rate THEN
          SELECT COALESCE(points, 0) INTO _up_self_pts
            FROM public.monthly_responsibility_points
            WHERE member_id = _current_id AND ym = _ym;
          _up_self_pts := COALESCE(_up_self_pts, 0);

          IF _up_self_pts >= COALESCE(_up_rank.required_points, _s.vip_required_points) THEN
            _diff_rate := _up_rank.exceeded_rebate_rate - _max_rate;
            _diff_pts := floor(_excess * _diff_rate / 100)::int;
            IF _diff_pts > 0 THEN
              INSERT INTO public.bonus_records(
                member_id, source_member_id, bonus_type, base_amount, bonus_rate, bonus_points,
                required_points_checked, required_points_passed,
                status, settlement_batch_id, settlement_date, release_date, layer_level
              ) VALUES (
                _current_id, _vip.id, 'rank_diff_rebate', _excess, _diff_rate, _diff_pts,
                true, true, 'waiting_release',
                _batch_id, _settle_date, _release_date, _hop
              );
              _total_pts := _total_pts + _diff_pts;
            END IF;
            _max_rate := _up_rank.exceeded_rebate_rate;
          END IF;
        END IF;

        _current_id := _up_id;
      END LOOP;
    END IF;
  END LOOP;

  UPDATE public.bonus_settlement_batches
    SET status = 'completed', completed_at = now(),
        total_members = _members, total_bonus_points = _total_pts
    WHERE id = _batch_id;

  RETURN jsonb_build_object(
    'ok', true,
    'batch_id', _batch_id,
    'ym', _ym,
    'granted', _granted,
    'points', _total_pts,
    'release_date', _release_date,
    'source', _source
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.settle_monthly_bonus(text, uuid, text) TO authenticated, service_role;
