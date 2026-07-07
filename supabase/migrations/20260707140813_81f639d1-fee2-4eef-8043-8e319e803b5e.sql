
-- Legacy rank (Chinese label) → rank_rebate_settings.rank_code mapping
CREATE OR REPLACE FUNCTION public.map_legacy_rank_to_code(_legacy text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE btrim(COALESCE(_legacy, ''))
    WHEN 'VIP會員'   THEN 'vip'
    WHEN 'S經銷商'   THEN 'svip'
    WHEN 'T代理商'   THEN 'tvip'
    WHEN 'E代理商'   THEN 'evip'
    WHEN 'A代理商'   THEN 'avip'
    WHEN '一星代理' THEN 'vip1'
    WHEN '二星代理' THEN 'vip2'
    WHEN '三星代理' THEN 'vip3'
    WHEN '四星代理' THEN 'vip4'
    WHEN '五星代理' THEN 'vip5'
    WHEN '六星代理' THEN 'vip6'
    WHEN '七星代理' THEN 'vip7'
    WHEN '董事'     THEN 'director'
    -- M網路會員 為免費會員，不對應任何 rank_rebate 代碼
    ELSE NULL
  END
$$;

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
    status, created_by
  ) VALUES (
    'monthly', _period_start, _period_end, 'processing', _created_by
  ) RETURNING id INTO _batch_id;

  FOR _vip IN
    SELECT id, legacy_rank FROM public.profiles
    WHERE is_vip = true
      AND (vip_expires_at IS NULL OR vip_expires_at >= _period_end::timestamptz)
  LOOP
    -- Resolve this member's rank rebate row (may be NULL for 免費會員)
    _rank_code := public.map_legacy_rank_to_code(_vip.legacy_rank);
    _member_rank := NULL;
    IF _rank_code IS NOT NULL THEN
      SELECT * INTO _member_rank FROM public.rank_rebate_settings
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
        WHEN NOT _passed THEN format('當月自我+第一代 %s/%s 未達標', _total_base, _required)
        WHEN _tier_rate = 0 THEN format('未達任一加發門檻 (%s)', _total_base)
        ELSE NULL
      END,
      CASE WHEN _passed AND _bonus_pts > 0 THEN 'waiting_release' ELSE 'cancelled' END,
      _batch_id, _settle_date,
      CASE WHEN _passed AND _bonus_pts > 0 THEN _release_date ELSE NULL END
    );

    IF _passed AND _bonus_pts > 0 THEN
      _granted := _granted + 1;
      _total_pts := _total_pts + _bonus_pts;
      _members := _members + 1;
    END IF;

    -- 超額回饋（依會員個人位階回饋比例，以個人責任額為基礎）
    IF _passed AND _member_rank.id IS NOT NULL
       AND _self_pts > _required
       AND COALESCE(_member_rank.exceeded_rebate_rate, 0) > 0 THEN
      _excess := _self_pts - _required;
      _rebate := floor(_excess * _member_rank.exceeded_rebate_rate / 100)::int;
      IF _rebate > 0 THEN
        INSERT INTO public.bonus_records(
          member_id, bonus_type, base_amount, bonus_rate, bonus_points,
          required_points_checked, required_points_passed,
          status, settlement_batch_id, settlement_date, release_date
        ) VALUES (
          _vip.id, 'rank_rebate', _excess, _member_rank.exceeded_rebate_rate, _rebate,
          true, true, 'waiting_release',
          _batch_id, _settle_date, _release_date
        );
        _total_pts := _total_pts + _rebate;
      END IF;
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
