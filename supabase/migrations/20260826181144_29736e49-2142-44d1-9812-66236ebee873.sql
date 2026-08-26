-- 1) 升級推薦比例 = 推薦級差比例
UPDATE public.vip_tiers SET upgrade_referral_rate = daily_referral_rate
WHERE upgrade_referral_rate IS DISTINCT FROM daily_referral_rate;

-- 2) 近 90 天推薦 VIP 條件
CREATE OR REPLACE FUNCTION private.has_recent_vip_referral(_user_id uuid, _on date DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ref AS (
    SELECT p.id FROM public.profiles p WHERE p.referred_by = _user_id
  ), win AS (
    SELECT (COALESCE(_on, CURRENT_DATE) - 90) AS from_d, COALESCE(_on, CURRENT_DATE) AS to_d
  )
  SELECT EXISTS (
    SELECT 1 FROM public.vip_package_upgrade_logs l, win
    WHERE l.user_id IN (SELECT id FROM ref)
      AND COALESCE(l.upgraded, true)
      AND (l.created_at AT TIME ZONE 'Asia/Taipei')::date BETWEEN win.from_d AND win.to_d
    UNION ALL
    SELECT 1 FROM public.vip_memberships m, win
    WHERE m.user_id IN (SELECT id FROM ref)
      AND (m.started_at AT TIME ZONE 'Asia/Taipei')::date BETWEEN win.from_d AND win.to_d
    UNION ALL
    SELECT 1 FROM public.vip_upgrade_orders o, win
    WHERE o.user_id IN (SELECT id FROM ref)
      AND o.payment_status = 'paid'
      AND (COALESCE(o.paid_at, o.created_at) AT TIME ZONE 'Asia/Taipei')::date BETWEEN win.from_d AND win.to_d
  )
$$;

-- 3) 消費分紅池：合格名單 + 近 90 天推薦 VIP
DROP FUNCTION IF EXISTS private.list_pool_eligible_members(uuid, date);
CREATE OR REPLACE FUNCTION private.list_pool_eligible_members(_pool_id uuid, _on date DEFAULT NULL)
RETURNS TABLE(member_id uuid, legacy_code text, mapped_code text, pool_ordinal integer, tier_mapping_source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _codes text[];
  _status text;
  _code text;
  _kind text;
  _exclusive boolean;
BEGIN
  SELECT tier_codes, status, code INTO _codes, _status, _code
  FROM public.vip_bonus_pools WHERE id = _pool_id;
  IF _codes IS NULL OR array_length(_codes,1) IS NULL THEN
    RETURN;
  END IF;
  IF _status IS NOT NULL AND _status <> 'active' THEN
    RETURN;
  END IF;
  _kind := private.pool_kind_for_code(_code);

  SELECT EXISTS (
    SELECT 1 FROM public.member_bonus_eligibility_grants g
    WHERE g.pool_kind = _kind
      AND g.exclusive
      AND COALESCE(_on, CURRENT_DATE) BETWEEN g.starts_on AND g.ends_on
  ) INTO _exclusive;

  IF _exclusive THEN
    RETURN QUERY
    SELECT g.user_id,
           ev.legacy_code,
           COALESCE(ev.vip_tier_code, _codes[1]),
           ev.pool_ordinal,
           'manual_grant_exclusive'::text
    FROM public.member_bonus_eligibility_grants g
    LEFT JOIN LATERAL private.get_effective_vip_tier(g.user_id, _on) ev ON true
    WHERE g.pool_kind = _kind
      AND g.exclusive
      AND COALESCE(_on, CURRENT_DATE) BETWEEN g.starts_on AND g.ends_on
      AND (
        ev.legacy_code IS NULL
        OR private.pool_tier_matches(_codes, ev.legacy_code)
      )
      AND (_kind <> 'consumption' OR private.has_recent_vip_referral(g.user_id, _on));
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.user_id,
         ev.legacy_code,
         ev.vip_tier_code,
         ev.pool_ordinal,
         'get_effective_vip_tier'::text
  FROM public.dealer_tier_status s
  LEFT JOIN LATERAL private.get_effective_vip_tier(s.user_id, _on) ev ON true
  WHERE ev.vip_tier_code IS NOT NULL
    AND private.pool_tier_matches(_codes, ev.legacy_code)
    AND (_kind <> 'consumption' OR private.has_recent_vip_referral(s.user_id, _on))

  UNION

  SELECT g.user_id,
         ev.legacy_code,
         COALESCE(ev.vip_tier_code, _codes[1]),
         ev.pool_ordinal,
         'manual_grant'::text
  FROM public.member_bonus_eligibility_grants g
  LEFT JOIN LATERAL private.get_effective_vip_tier(g.user_id, _on) ev ON true
  WHERE g.pool_kind = _kind
    AND COALESCE(_on, CURRENT_DATE) BETWEEN g.starts_on AND g.ends_on
    AND (_kind <> 'consumption' OR private.has_recent_vip_referral(g.user_id, _on))
    AND NOT EXISTS (
      SELECT 1 FROM public.dealer_tier_status s2
      LEFT JOIN LATERAL private.get_effective_vip_tier(s2.user_id, _on) ev2 ON true
      WHERE s2.user_id = g.user_id
        AND ev2.vip_tier_code IS NOT NULL
        AND private.pool_tier_matches(_codes, ev2.legacy_code)
    );
END;
$$;

-- 4) 分紅池發放：加入累計上限停發
CREATE OR REPLACE FUNCTION public.distribute_vip_bonus_pool_daily(
  _pool_id uuid,
  _settlement_date date DEFAULT (CURRENT_DATE - 1),
  _daily_total_reward_points numeric DEFAULT 0
)
RETURNS TABLE(pool_id uuid, payout_date date, eligible_count integer,
              pool_amount numeric, per_head_amount numeric,
              distributed_count integer, skipped_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pool public.vip_bonus_pools;
  _calc record;
  _member record;
  _count integer := 0;
  _distributed integer := 0;
  _skipped integer := 0;
  _uid uuid := auth.uid();
  _cap numeric;
  _before numeric;
  _payable numeric;
  _capped numeric;
  _status text;
BEGIN
  IF _uid IS NOT NULL
     AND NOT (
        private.has_role(_uid, 'super_admin'::app_role)
        OR private.has_role(_uid, 'admin'::app_role)
        OR private.has_role(_uid, 'finance'::app_role)
     ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT * INTO _pool FROM public.vip_bonus_pools WHERE id = _pool_id;
  IF _pool.id IS NULL THEN
    RAISE EXCEPTION 'pool not found';
  END IF;

  SELECT count(*)::int INTO _count
  FROM private.list_pool_eligible_members(_pool_id, _settlement_date);

  SELECT * INTO _calc
  FROM public.calc_vip_bonus_pool_daily(_pool_id, COALESCE(_daily_total_reward_points,0), _count);

  FOR _member IN
    SELECT * FROM private.list_pool_eligible_members(_pool_id, _settlement_date)
    ORDER BY member_id
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.vip_bonus_pool_payouts p
      WHERE p.pool_id = _pool_id
        AND p.payout_date = _settlement_date
        AND p.member_id = _member.member_id
    ) THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    _cap := COALESCE(
      _pool.total_income_cap_amount,
      (SELECT vt.business_bonus_cap_amount FROM public.vip_tiers vt
        WHERE vt.code = COALESCE(_member.mapped_code, _member.legacy_code) LIMIT 1)
    );
    SELECT COALESCE(SUM(p.payable_amount),0) INTO _before
    FROM public.vip_bonus_pool_payouts p
    WHERE p.pool_id = _pool_id AND p.member_id = _member.member_id;

    _payable := _calc.per_member_amount;
    _capped := 0;
    _status := _calc.status;
    IF _cap IS NOT NULL AND _cap > 0 THEN
      _payable := GREATEST(LEAST(_calc.per_member_amount, _cap - _before), 0);
      _capped := _calc.per_member_amount - _payable;
      IF _payable = 0 AND _calc.per_member_amount > 0 THEN
        _status := 'capped';
      ELSIF _capped > 0 THEN
        _status := 'partial_capped';
      END IF;
    END IF;

    INSERT INTO public.vip_bonus_pool_payouts(
      pool_id, payout_date, member_id, tier_code,
      daily_total_reward_points, bonus_rate, pool_amount, eligible_member_count,
      bonus_amount, payable_amount, capped_amount,
      total_before, total_after, cap_amount, status, notes,
      calculation_detail, created_by
    ) VALUES (
      _pool_id, _settlement_date, _member.member_id,
      COALESCE(_member.mapped_code, _member.legacy_code),
      COALESCE(_daily_total_reward_points,0), _calc.bonus_rate, _calc.pool_amount, _count,
      _calc.per_member_amount, _payable, _capped,
      _before, _before + _payable, COALESCE(_cap, 0),
      _status,
      format('VIP pool %s：池 %s × %s = %s ÷ %s 人 = %s（實發 %s）',
        _pool.code, COALESCE(_daily_total_reward_points,0), _calc.bonus_rate,
        _calc.pool_amount, _count, _calc.per_member_amount, _payable),
      jsonb_build_object(
        'rule_version','v3_pool_cap_and_referral_condition',
        'rule_id','vip_bonus_pool_daily',
        'pool_code', _pool.code,
        'pool_name', _pool.name,
        'pool_tier_codes', to_jsonb(_pool.tier_codes),
        'legacy_tier_code', _member.legacy_code,
        'mapped_tier_code', _member.mapped_code,
        'pool_ordinal', _member.pool_ordinal,
        'tier_mapping_source', _member.tier_mapping_source,
        'pool_rate', _calc.bonus_rate,
        'distribution_method', _pool.distribution_method,
        'eligible_member_count', _count,
        'source_total_points', COALESCE(_daily_total_reward_points,0),
        'distributed_points', _payable,
        'capped_points', _capped,
        'cap_amount', _cap,
        'requires_recent_vip_referral', (private.pool_kind_for_code(_pool.code) = 'consumption'),
        'block_reason', CASE WHEN _status = 'capped' THEN '已達累計上限停發' ELSE NULL END
      ),
      _uid
    );
    IF _payable > 0 THEN
      _distributed := _distributed + 1;
    ELSE
      _skipped := _skipped + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT _pool_id, _settlement_date, _count,
                      _calc.pool_amount, _calc.per_member_amount,
                      _distributed, _skipped;
END;
$$;