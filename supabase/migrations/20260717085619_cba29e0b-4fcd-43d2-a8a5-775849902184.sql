
CREATE OR REPLACE FUNCTION public.settle_monthly_national_share(
  _yyyymm text,
  _created_by uuid DEFAULT NULL,
  _source text DEFAULT 'monthly_settlement',
  _batch_id uuid DEFAULT NULL,
  _dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _bs public.bonus_settings;
  _year int;
  _month int;
  _period_start date;
  _period_end date;
  _release_date date;
  _total_points numeric := 0;
  _tier record;
  _member record;
  _eligible_count int;
  _pool_amount numeric;
  _per_head numeric;
  _cap_before numeric;
  _cap_remaining numeric;
  _raw_share numeric;
  _payable numeric;
  _cap_after numeric;
  _blocked text;
  _distributed int;
  _skipped int;
  _blocked_cnt int;
  _dist_points numeric;
  _tier_results jsonb := '[]'::jsonb;
BEGIN
  -- AuthZ: block anon/authenticated non-privileged; allow service_role (auth.uid() IS NULL)
  IF _uid IS NOT NULL
     AND NOT (
        private.has_role(_uid, 'super_admin'::app_role)
        OR private.has_role(_uid, 'admin'::app_role)
        OR private.has_role(_uid, 'finance'::app_role)
     ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF _yyyymm IS NULL OR length(_yyyymm) <> 6 THEN
    RAISE EXCEPTION 'invalid _yyyymm: %', _yyyymm;
  END IF;

  SELECT * INTO _bs FROM public.bonus_settings ORDER BY created_at LIMIT 1;
  IF _bs.id IS NULL THEN
    RAISE EXCEPTION 'bonus_settings not initialised';
  END IF;

  _year := substring(_yyyymm from 1 for 4)::int;
  _month := substring(_yyyymm from 5 for 2)::int;
  _period_start := make_date(_year, _month, 1);
  _period_end := (_period_start + interval '1 month' - interval '1 day')::date;
  _release_date := (_period_end + (COALESCE(_bs.reward_release_days,0) || ' days')::interval)::date;

  -- 月營業總獎勵點：與 daily 使用相同來源 (point_transactions reward)
  SELECT COALESCE(SUM(amount), 0) INTO _total_points
  FROM public.point_transactions
  WHERE point_type = 'reward'
    AND source IN ('order_earn','order_earn_referrer')
    AND created_at >= _period_start::timestamptz
    AND created_at <  (_period_end + 1)::timestamptz;

  FOR _tier IN
    SELECT s.tier_code, s.pool_rate, s.income_cap_amount
    FROM public.national_bonus_pool_settings s
    WHERE s.is_active = true
      AND s.tier_code IN ('STAR5','STAR6','STAR7','DIRECTOR')
      AND (s.effective_from IS NULL OR s.effective_from <= _period_end)
    ORDER BY s.tier_code
  LOOP
    _pool_amount := ROUND(_total_points * COALESCE(_tier.pool_rate,0), 0);

    CREATE TEMP TABLE IF NOT EXISTS _mnb_candidates(
      member_id uuid PRIMARY KEY,
      legacy_code text,
      mapped_code text,
      pool_ordinal text,
      is_vip boolean,
      vip_expires_at timestamptz
    ) ON COMMIT DROP;
    TRUNCATE _mnb_candidates;

    INSERT INTO _mnb_candidates(member_id, legacy_code, mapped_code, pool_ordinal, is_vip, vip_expires_at)
    SELECT s.member_id, ev.legacy_code, ev.vip_tier_code, ev.pool_ordinal,
           COALESCE(p.is_vip,false), p.vip_expires_at
    FROM public.dealer_tier_status s
    LEFT JOIN LATERAL private.get_effective_vip_tier(s.member_id, _period_end) ev ON true
    LEFT JOIN public.profiles p ON p.id = s.member_id
    WHERE ev.vip_tier_code = _tier.tier_code
      AND COALESCE(p.is_vip,false) = true
      AND p.vip_expires_at IS NOT NULL
      AND p.vip_expires_at::date >= _period_end;

    SELECT count(*)::int INTO _eligible_count FROM _mnb_candidates;

    _distributed := 0; _skipped := 0; _blocked_cnt := 0; _dist_points := 0;

    IF _eligible_count = 0 OR _total_points <= 0 OR COALESCE(_tier.pool_rate,0) <= 0 THEN
      _tier_results := _tier_results || jsonb_build_object(
        'tier_code', _tier.tier_code,
        'pool_rate', _tier.pool_rate,
        'pool_amount', _pool_amount,
        'eligible_count', _eligible_count,
        'distributed', 0, 'skipped', 0, 'blocked', 0,
        'distributed_points', 0
      );
      CONTINUE;
    END IF;

    _per_head := ROUND(_pool_amount::numeric / _eligible_count, 0);

    FOR _member IN SELECT * FROM _mnb_candidates ORDER BY member_id LOOP
      -- Idempotency: skip if a national_share record already exists for this member in this period
      IF EXISTS (
        SELECT 1 FROM public.bonus_records
        WHERE member_id = _member.member_id
          AND bonus_type = 'national_share'
          AND settlement_date = _period_end
          AND COALESCE((calculation_detail->>'tier_code'), '') = _tier.tier_code
      ) THEN
        _skipped := _skipped + 1;
        CONTINUE;
      END IF;

      -- Monthly cumulative cap: sum only this month's ledger rows for this member/tier
      SELECT COALESCE(SUM(distributed_points), 0) INTO _cap_before
      FROM public.national_bonus_pool_ledger
      WHERE member_id = _member.member_id
        AND tier_code = _tier.tier_code
        AND settlement_date >= _period_start
        AND settlement_date <= _period_end;

      _cap_remaining := GREATEST(COALESCE(_tier.income_cap_amount,0) - _cap_before, 0);
      _raw_share := _per_head;
      _payable := LEAST(_raw_share, _cap_remaining);
      _cap_after := _cap_before + _payable;
      _blocked := CASE
        WHEN _cap_remaining <= 0 THEN 'cap_reached'
        WHEN _payable < _raw_share THEN 'cap_partial'
        ELSE NULL
      END;

      IF _dry_run THEN
        IF _payable <= 0 THEN
          _blocked_cnt := _blocked_cnt + 1;
        ELSE
          _distributed := _distributed + 1;
          _dist_points := _dist_points + _payable;
        END IF;
        CONTINUE;
      END IF;

      -- Ledger (settlement_date = period_end so daily & monthly unique keys don't collide within same day)
      INSERT INTO public.national_bonus_pool_ledger(
        member_id, tier_code, settlement_date,
        source_total_points, pool_amount, distributed_points,
        cap_before, cap_after, calculation_detail
      ) VALUES (
        _member.member_id, _tier.tier_code, _period_end,
        _total_points, _pool_amount, _payable,
        _cap_before, _cap_after,
        jsonb_build_object(
          'rule_version','v3_monthly_national_share',
          'period', _yyyymm,
          'period_start', _period_start,
          'period_end', _period_end,
          'raw_share_points', _raw_share,
          'per_head', _per_head,
          'eligible_member_count', _eligible_count,
          'pool_rate', _tier.pool_rate,
          'cap_amount', _tier.income_cap_amount,
          'cap_remaining_before', _cap_remaining,
          'blocked_reason', _blocked,
          'source', _source,
          'batch_id', _batch_id
        )
      )
      ON CONFLICT (member_id, tier_code, settlement_date) DO NOTHING;

      IF _payable <= 0 THEN
        INSERT INTO public.bonus_records(
          member_id, bonus_type, base_amount, bonus_rate, bonus_points,
          required_points_checked, required_points_passed, fail_reason,
          status, settlement_batch_id, settlement_date, release_date,
          calculation_detail
        ) VALUES (
          _member.member_id, 'national_share',
          _total_points, _tier.pool_rate, 0,
          true, false, 'national_share_monthly_cap_reached',
          'cancelled', _batch_id, _period_end, NULL,
          jsonb_build_object(
            'rule_version','v3_monthly_national_share',
            'bonus_type','national_share',
            'period', _yyyymm,
            'settlement_date', _period_end,
            'source_total_reward_points', _total_points,
            'national_pool_amount', _pool_amount,
            'tier_code', _tier.tier_code,
            'legacy_tier_code', _member.legacy_code,
            'mapped_tier_code', _member.mapped_code,
            'pool_ordinal', _member.pool_ordinal,
            'pool_rate', _tier.pool_rate,
            'eligible_member_count', _eligible_count,
            'raw_share_points', _raw_share,
            'cap_amount', _tier.income_cap_amount,
            'cap_remaining_before', _cap_remaining,
            'distributed_points', 0,
            'cap_after', _cap_before,
            'blocked_reason', COALESCE(_blocked,'cap_reached'),
            'vip_snapshot', jsonb_build_object('is_vip', _member.is_vip, 'vip_expires_at', _member.vip_expires_at),
            'tier_mapping_source', 'get_effective_vip_tier',
            'source', _source,
            'batch_id', _batch_id
          )
        );
        _blocked_cnt := _blocked_cnt + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.bonus_records(
        member_id, bonus_type, base_amount, bonus_rate, bonus_points,
        required_points_checked, required_points_passed, fail_reason,
        status, settlement_batch_id, settlement_date, release_date,
        calculation_detail
      ) VALUES (
        _member.member_id, 'national_share',
        _total_points, _tier.pool_rate, _payable::int,
        true, true, NULL,
        'waiting_release', _batch_id, _period_end, _release_date,
        jsonb_build_object(
          'rule_version','v3_monthly_national_share',
          'bonus_type','national_share',
          'period', _yyyymm,
          'settlement_date', _period_end,
          'source_total_reward_points', _total_points,
          'national_pool_amount', _pool_amount,
          'tier_code', _tier.tier_code,
          'legacy_tier_code', _member.legacy_code,
          'mapped_tier_code', _member.mapped_code,
          'pool_ordinal', _member.pool_ordinal,
          'pool_rate', _tier.pool_rate,
          'eligible_member_count', _eligible_count,
          'raw_share_points', _raw_share,
          'cap_amount', _tier.income_cap_amount,
          'cap_remaining_before', _cap_remaining,
          'distributed_points', _payable,
          'cap_after', _cap_after,
          'blocked_reason', _blocked,
          'vip_snapshot', jsonb_build_object('is_vip', _member.is_vip, 'vip_expires_at', _member.vip_expires_at),
          'tier_mapping_source', 'get_effective_vip_tier',
          'source', _source,
          'batch_id', _batch_id
        )
      );

      _distributed := _distributed + 1;
      _dist_points := _dist_points + _payable;
    END LOOP;

    _tier_results := _tier_results || jsonb_build_object(
      'tier_code', _tier.tier_code,
      'pool_rate', _tier.pool_rate,
      'pool_amount', _pool_amount,
      'eligible_count', _eligible_count,
      'distributed', _distributed,
      'skipped', _skipped,
      'blocked', _blocked_cnt,
      'distributed_points', _dist_points
    );
  END LOOP;

  RETURN jsonb_build_object(
    'rule_version','v3_monthly_national_share',
    'period', _yyyymm,
    'period_start', _period_start,
    'period_end', _period_end,
    'release_date', _release_date,
    'source_total_reward_points', _total_points,
    'batch_id', _batch_id,
    'source', _source,
    'dry_run', _dry_run,
    'tiers', _tier_results
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.settle_monthly_national_share(text, uuid, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_monthly_national_share(text, uuid, text, uuid, boolean) TO authenticated, service_role;
