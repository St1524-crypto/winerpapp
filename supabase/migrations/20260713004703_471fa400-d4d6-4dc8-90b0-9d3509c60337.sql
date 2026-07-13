ALTER TABLE public.bonus_records
  ADD COLUMN IF NOT EXISTS calculation_detail jsonb;

COMMENT ON COLUMN public.bonus_records.calculation_detail IS
  'Calculation snapshot for audit/display. Monthly bonuses store self_points, first_generation_points, required_points, total_base_points, excess_points, applied_rate, and related rank metadata.';

CREATE INDEX IF NOT EXISTS idx_bonus_records_monthly_calculation_detail
  ON public.bonus_records USING gin (calculation_detail)
  WHERE bonus_type IN ('monthly_vip', 'rank_rebate', 'rank_diff_rebate')
    AND calculation_detail IS NOT NULL;

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
      status, settlement_batch_id, settlement_date, release_date,
      calculation_detail
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
      CASE WHEN _passed AND _bonus_pts > 0 THEN _release_date ELSE NULL END,
      jsonb_build_object(
        'period', _ym,
        'self_points', _self_pts,
        'first_generation_points', _first_gen_pts,
        'required_points', _required,
        'total_base_points', _total_base,
        'excess_points', GREATEST(_self_pts - _required, 0),
        'applied_rate', _tier_rate,
        'bonus_points', _bonus_pts,
        'passed', _passed,
        'rank_code', _rank_code,
        'rank_name', _member_rank.rank_name,
        'source', _source
      )
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
            status, settlement_batch_id, settlement_date, release_date,
            calculation_detail
          ) VALUES (
            _vip.id, _vip.id, 'rank_rebate', _excess, _member_rank.exceeded_rebate_rate, _rebate,
            true, true, 'waiting_release',
            _batch_id, _settle_date, _release_date,
            jsonb_build_object(
              'period', _ym,
              'self_points', _self_pts,
              'first_generation_points', _first_gen_pts,
              'required_points', _required,
              'total_base_points', _total_base,
              'excess_points', _excess,
              'applied_rate', _member_rank.exceeded_rebate_rate,
              'bonus_points', _rebate,
              'rank_code', _rank_code,
              'rank_name', _member_rank.rank_name,
              'source_member_id', _vip.id,
              'source', _source
            )
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
                status, settlement_batch_id, settlement_date, release_date, layer_level,
                calculation_detail
              ) VALUES (
                _current_id, _vip.id, 'rank_diff_rebate', _excess, _diff_rate, _diff_pts,
                true, true, 'waiting_release',
                _batch_id, _settle_date, _release_date, _hop,
                jsonb_build_object(
                  'period', _ym,
                  'source_member_id', _vip.id,
                  'source_self_points', _self_pts,
                  'source_first_generation_points', _first_gen_pts,
                  'source_required_points', _required,
                  'source_total_base_points', _total_base,
                  'source_excess_points', _excess,
                  'recipient_self_points', _up_self_pts,
                  'recipient_required_points', COALESCE(_up_rank.required_points, _s.vip_required_points),
                  'previous_rate', _max_rate,
                  'recipient_rate', _up_rank.exceeded_rebate_rate,
                  'applied_rate', _diff_rate,
                  'bonus_points', _diff_pts,
                  'rank_code', _up_code,
                  'rank_name', _up_rank.rank_name,
                  'layer_level', _hop,
                  'source', _source
                )
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