CREATE OR REPLACE FUNCTION public.distribute_vip_bonus_pool_daily(_pool_id uuid, _settlement_date date DEFAULT (CURRENT_DATE - 1), _daily_total_reward_points numeric DEFAULT 0)
 RETURNS TABLE(pool_id uuid, payout_date date, eligible_count integer, pool_amount numeric, per_head_amount numeric, distributed_count integer, skipped_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  _kind text;
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

  _kind := private.pool_kind_for_code(_pool.code);

  SELECT count(*)::int INTO _count
  FROM private.list_pool_eligible_members(_pool_id, _settlement_date) e
  WHERE NOT EXISTS (SELECT 1 FROM public.member_dividend_exclusions x WHERE x.user_id = e.member_id);

  SELECT * INTO _calc
  FROM public.calc_vip_bonus_pool_daily(_pool_id, COALESCE(_daily_total_reward_points,0), _count);

  FOR _member IN
    SELECT * FROM private.list_pool_eligible_members(_pool_id, _settlement_date) e
    WHERE NOT EXISTS (SELECT 1 FROM public.member_dividend_exclusions x WHERE x.user_id = e.member_id)
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

    IF _kind = 'business' THEN
      -- 營業分紅：上限採星級營業分紅上限，累計含所有營業分紅池與既有營業分紅帳。
      _cap := COALESCE(
        _pool.total_income_cap_amount,
        (SELECT vt.upgrade_bonus_cap FROM public.vip_tiers vt
          WHERE vt.code = COALESCE(_member.mapped_code, _member.legacy_code) LIMIT 1)
      );
      SELECT COALESCE((SELECT SUM(p.payable_amount) FROM public.vip_bonus_pool_payouts p
               JOIN public.vip_bonus_pools bp ON bp.id = p.pool_id
               WHERE p.member_id = _member.member_id AND private.pool_kind_for_code(bp.code) = 'business'),0)
           + COALESCE((SELECT SUM(l.payable_amount) FROM public.vip_upgrade_bonus_ledger l
               WHERE l.member_id = _member.member_id AND l.status IN ('released','partial_capped')),0)
        INTO _before;
    ELSE
      _cap := COALESCE(
        _pool.total_income_cap_amount,
        (SELECT vt.business_bonus_cap_amount FROM public.vip_tiers vt
          WHERE vt.code = COALESCE(_member.mapped_code, _member.legacy_code) LIMIT 1)
      );
      SELECT COALESCE(SUM(p.payable_amount),0) INTO _before
      FROM public.vip_bonus_pool_payouts p
      WHERE p.pool_id = _pool_id AND p.member_id = _member.member_id;
    END IF;

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
        'pool_kind', _kind,
        'requires_recent_vip_referral', (_kind = 'consumption'),
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
$function$;