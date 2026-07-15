
-- Idempotency guard for national_share bonus_records
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bonus_records_national_share
  ON public.bonus_records (member_id, bonus_type, settlement_date)
  WHERE bonus_type = 'national_share' AND settlement_date IS NOT NULL;

CREATE OR REPLACE FUNCTION public.distribute_national_bonus_v2(
  _settlement_date date DEFAULT (CURRENT_DATE - 1),
  _daily_total_reward_points numeric DEFAULT 0
)
RETURNS TABLE(
  settlement_date date,
  tier_code text,
  pool_rate numeric,
  pool_amount numeric,
  eligible_count integer,
  distributed_count integer,
  skipped_count integer,
  blocked_count integer,
  distributed_points numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _bs public.bonus_settings;
  _release_date date;
  _tier record;
  _member record;
  _eligible_count int;
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
BEGIN
  -- Permission: block anon/authenticated. Allow service_role (auth.uid() IS NULL) and privileged users only.
  IF _uid IS NOT NULL
     AND NOT (
        private.has_role(_uid, 'super_admin'::app_role)
        OR private.has_role(_uid, 'admin'::app_role)
        OR private.has_role(_uid, 'finance'::app_role)
     ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT * INTO _bs FROM public.bonus_settings ORDER BY created_at LIMIT 1;
  _release_date := _settlement_date + COALESCE(_bs.reward_release_days, 0);

  -- Loop each active tier in national_bonus_pool_settings
  FOR _tier IN
    SELECT s.tier_code, s.pool_rate, s.income_cap_amount
    FROM public.national_bonus_pool_settings s
    WHERE s.is_active = true
      AND s.tier_code IN ('STAR5','STAR6','STAR7','DIRECTOR')
      AND (s.effective_from IS NULL OR s.effective_from <= _settlement_date)
    ORDER BY s.tier_code
  LOOP
    -- Collect eligible members for this tier
    CREATE TEMP TABLE IF NOT EXISTS _nb_candidates(
      member_id uuid PRIMARY KEY,
      legacy_code text,
      mapped_code text,
      pool_ordinal text,
      is_vip boolean,
      vip_expires_at timestamptz
    ) ON COMMIT DROP;
    TRUNCATE _nb_candidates;

    INSERT INTO _nb_candidates(member_id, legacy_code, mapped_code, pool_ordinal, is_vip, vip_expires_at)
    SELECT s.member_id, ev.legacy_code, ev.vip_tier_code, ev.pool_ordinal,
           COALESCE(p.is_vip,false), p.vip_expires_at
    FROM public.dealer_tier_status s
    LEFT JOIN LATERAL private.get_effective_vip_tier(s.member_id, _settlement_date) ev ON true
    LEFT JOIN public.profiles p ON p.id = s.member_id
    WHERE ev.vip_tier_code = _tier.tier_code
      AND COALESCE(p.is_vip,false) = true
      AND p.vip_expires_at IS NOT NULL
      AND p.vip_expires_at::date >= _settlement_date;

    SELECT count(*)::int INTO _eligible_count FROM _nb_candidates;

    _distributed := 0; _skipped := 0; _blocked_cnt := 0; _dist_points := 0;

    IF _eligible_count = 0 OR COALESCE(_daily_total_reward_points,0) <= 0 OR COALESCE(_tier.pool_rate,0) <= 0 THEN
      RETURN QUERY SELECT _settlement_date, _tier.tier_code, _tier.pool_rate,
        ROUND(COALESCE(_daily_total_reward_points,0) * COALESCE(_tier.pool_rate,0), 0),
        _eligible_count, 0, 0, 0, 0::numeric;
      CONTINUE;
    END IF;

    _per_head := ROUND(COALESCE(_daily_total_reward_points,0) * _tier.pool_rate / _eligible_count, 0);

    FOR _member IN SELECT * FROM _nb_candidates ORDER BY member_id LOOP
      -- Idempotent skip: already have a bonus_record for this member/day
      IF EXISTS (
        SELECT 1 FROM public.bonus_records
        WHERE member_id = _member.member_id
          AND bonus_type = 'national_share'
          AND settlement_date = _settlement_date
      ) THEN
        _skipped := _skipped + 1;
        CONTINUE;
      END IF;

      -- Prior cumulative national_share for this member/tier
      SELECT COALESCE(SUM(distributed_points),0) INTO _cap_before
      FROM public.national_bonus_pool_ledger
      WHERE member_id = _member.member_id
        AND tier_code = _tier.tier_code;

      _cap_remaining := GREATEST(COALESCE(_tier.income_cap_amount,0) - _cap_before, 0);
      _raw_share := _per_head;
      _payable := LEAST(_raw_share, _cap_remaining);
      _cap_after := _cap_before + _payable;
      _blocked := CASE
        WHEN _cap_remaining <= 0 THEN 'cap_reached'
        WHEN _payable < _raw_share THEN 'cap_partial'
        ELSE NULL
      END;

      -- Write ledger (idempotent by unique key)
      INSERT INTO public.national_bonus_pool_ledger(
        member_id, tier_code, settlement_date,
        source_total_points, pool_amount, distributed_points,
        cap_before, cap_after, calculation_detail
      ) VALUES (
        _member.member_id, _tier.tier_code, _settlement_date,
        COALESCE(_daily_total_reward_points,0),
        ROUND(COALESCE(_daily_total_reward_points,0) * _tier.pool_rate, 0),
        _payable, _cap_before, _cap_after,
        jsonb_build_object(
          'rule_version','v2_batch2_national_share',
          'raw_share_points', _raw_share,
          'per_head', _per_head,
          'eligible_member_count', _eligible_count,
          'pool_rate', _tier.pool_rate,
          'cap_amount', _tier.income_cap_amount,
          'cap_remaining_before', _cap_remaining,
          'blocked_reason', _blocked
        )
      )
      ON CONFLICT (member_id, tier_code, settlement_date) DO NOTHING;

      -- If cap fully reached with no payable, mark as blocked bonus_record (status cancelled)
      IF _payable <= 0 THEN
        INSERT INTO public.bonus_records(
          member_id, bonus_type, base_amount, bonus_rate, bonus_points,
          required_points_checked, required_points_passed, fail_reason,
          status, settlement_date, release_date, calculation_detail
        ) VALUES (
          _member.member_id, 'national_share',
          COALESCE(_daily_total_reward_points,0), _tier.pool_rate, 0,
          true, false, 'national_share_cap_reached',
          'cancelled', _settlement_date, NULL,
          jsonb_build_object(
            'rule_version','v2_batch2_national_share',
            'bonus_type','national_share',
            'source_total_reward_points', COALESCE(_daily_total_reward_points,0),
            'pool_rate', _tier.pool_rate,
            'national_pool_amount', ROUND(COALESCE(_daily_total_reward_points,0) * _tier.pool_rate, 0),
            'tier_code', _tier.tier_code,
            'legacy_tier_code', _member.legacy_code,
            'mapped_tier_code', _member.mapped_code,
            'pool_ordinal', _member.pool_ordinal,
            'eligible_member_count', _eligible_count,
            'raw_share_points', _raw_share,
            'cap_amount', _tier.income_cap_amount,
            'total_income_before', _cap_before,
            'cap_remaining_before', _cap_remaining,
            'distributed_points', 0,
            'cap_after', _cap_before,
            'blocked_reason', COALESCE(_blocked,'cap_reached'),
            'vip_snapshot', jsonb_build_object('is_vip', _member.is_vip, 'vip_expires_at', _member.vip_expires_at),
            'tier_mapping_source', 'get_effective_vip_tier'
          )
        );
        _blocked_cnt := _blocked_cnt + 1;
        CONTINUE;
      END IF;

      -- Insert bonus_record for release pipeline
      INSERT INTO public.bonus_records(
        member_id, bonus_type, base_amount, bonus_rate, bonus_points,
        required_points_checked, required_points_passed, fail_reason,
        status, settlement_date, release_date, calculation_detail
      ) VALUES (
        _member.member_id, 'national_share',
        COALESCE(_daily_total_reward_points,0), _tier.pool_rate,
        _payable::int,
        true, true, NULL,
        'waiting_release', _settlement_date, _release_date,
        jsonb_build_object(
          'rule_version','v2_batch2_national_share',
          'bonus_type','national_share',
          'source_total_reward_points', COALESCE(_daily_total_reward_points,0),
          'pool_rate', _tier.pool_rate,
          'national_pool_amount', ROUND(COALESCE(_daily_total_reward_points,0) * _tier.pool_rate, 0),
          'tier_code', _tier.tier_code,
          'legacy_tier_code', _member.legacy_code,
          'mapped_tier_code', _member.mapped_code,
          'pool_ordinal', _member.pool_ordinal,
          'eligible_member_count', _eligible_count,
          'raw_share_points', _raw_share,
          'cap_amount', _tier.income_cap_amount,
          'total_income_before', _cap_before,
          'cap_remaining_before', _cap_remaining,
          'distributed_points', _payable,
          'cap_after', _cap_after,
          'blocked_reason', _blocked,
          'vip_snapshot', jsonb_build_object('is_vip', _member.is_vip, 'vip_expires_at', _member.vip_expires_at),
          'tier_mapping_source', 'get_effective_vip_tier'
        )
      )
      ON CONFLICT DO NOTHING;

      _distributed := _distributed + 1;
      _dist_points := _dist_points + _payable;
    END LOOP;

    RETURN QUERY SELECT _settlement_date, _tier.tier_code, _tier.pool_rate,
      ROUND(COALESCE(_daily_total_reward_points,0) * _tier.pool_rate, 0),
      _eligible_count, _distributed, _skipped, _blocked_cnt, _dist_points;
  END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION public.distribute_national_bonus_v2(date, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.distribute_national_bonus_v2(date, numeric) TO service_role;
