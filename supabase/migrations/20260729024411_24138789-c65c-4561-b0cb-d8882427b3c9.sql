-- Align daily pool bonus base to the source order Taiwan date.
CREATE OR REPLACE FUNCTION public.calculate_daily_order_reward_points_by_source_date(
  _source_date date
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH distinct_source_orders AS (
    SELECT
      br.source_order_id,
      MAX(COALESCE(br.base_amount, 0)) AS reward_points
    FROM public.bonus_records br
    JOIN public.sales_orders so ON so.id = br.source_order_id
    WHERE br.source_order_id IS NOT NULL
      AND br.bonus_type IN ('referral', 'repurchase')
      AND br.status IN ('waiting_release', 'released')
      AND (so.created_at AT TIME ZONE 'Asia/Taipei')::date = _source_date
    GROUP BY br.source_order_id
  )
  SELECT COALESCE(SUM(reward_points), 0)::numeric
  FROM distinct_source_orders;
$function$;

REVOKE ALL ON FUNCTION public.calculate_daily_order_reward_points_by_source_date(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_daily_order_reward_points_by_source_date(date) TO service_role;

CREATE OR REPLACE FUNCTION public.distribute_daily_revenue_bonus(_date date DEFAULT (CURRENT_DATE - 1))
RETURNS TABLE(
  distribution_date date,
  total_reward_points numeric,
  pool_amount numeric,
  eligible_count integer,
  per_head_amount numeric,
  distributed_amount numeric,
  capped_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  _total_points numeric := 0;
  _pool numeric := 0;
  _count integer := 0;
  _per_head numeric := 0;
  _distributed numeric := 0;
  _capped numeric := 0;
  _pool_pct numeric := 5;
  _member record;
  _cap numeric;
  _current_total numeric;
  _remaining numeric;
  _payable numeric;
  _capped_amt numeric;
  _status text;
  _mapped text;
BEGIN
  _total_points := public.calculate_daily_order_reward_points_by_source_date(_date);
  _pool := ROUND(_total_points * _pool_pct / 100.0, 0);

  CREATE TEMP TABLE IF NOT EXISTS drb_candidates (
    member_id uuid PRIMARY KEY,
    legacy_code text,
    mapped_code text,
    pool_ordinal text,
    cap numeric
  ) ON COMMIT DROP;
  TRUNCATE drb_candidates;

  INSERT INTO drb_candidates(member_id, legacy_code, mapped_code, pool_ordinal, cap)
  SELECT
    s.user_id,
    ev.legacy_code,
    ev.vip_tier_code,
    ev.pool_ordinal,
    COALESCE(t.upgrade_bonus_cap, 0)
  FROM public.dealer_tier_status s
  LEFT JOIN LATERAL private.get_effective_vip_tier(s.user_id, _date) ev ON true
  LEFT JOIN public.dealer_tiers t ON t.code = s.current_tier
  WHERE ev.vip_tier_code IN ('STAR1','STAR2','STAR3','STAR4','STAR5','STAR6','STAR7','DIRECTOR');

  SELECT COUNT(*) INTO _count FROM drb_candidates;

  IF _count = 0 OR _pool <= 0 THEN
    RETURN QUERY SELECT _date, _total_points, _pool, _count, 0::numeric, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  _per_head := ROUND(_pool / _count, 0);

  FOR _member IN
    SELECT member_id, legacy_code, mapped_code, pool_ordinal, cap
    FROM drb_candidates
    ORDER BY member_id
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.vip_daily_revenue_bonus_ledger l
      WHERE l.distribution_date = _date
        AND l.member_id = _member.member_id
    ) THEN
      CONTINUE;
    END IF;

    _mapped := _member.mapped_code;
    _cap := COALESCE(_member.cap, 0);

    SELECT COALESCE(SUM(payable_amount), 0) INTO _current_total
    FROM public.vip_upgrade_bonus_ledger
    WHERE member_id = _member.member_id
      AND status IN ('released', 'partial_capped');

    _remaining := GREATEST(_cap - _current_total, 0);
    _payable := LEAST(_per_head, _remaining);
    _capped_amt := _per_head - _payable;

    IF _payable <= 0 THEN
      _status := 'capped';
    ELSIF _capped_amt > 0 THEN
      _status := 'partial_capped';
    ELSE
      _status := 'released';
    END IF;

    INSERT INTO public.vip_daily_revenue_bonus_ledger (
      distribution_date, member_id, tier_code,
      daily_total_reward_points, pool_percentage, eligible_member_count,
      allocated_amount, payable_amount, capped_amount,
      total_before, total_after, cap_amount, status,
      notes, calculation_detail
    ) VALUES (
      _date, _member.member_id, COALESCE(_mapped, _member.legacy_code),
      _total_points, _pool_pct, _count,
      _per_head, _payable, _capped_amt,
      _current_total, _current_total + _payable, _cap, _status,
      format('營業分紅：來源訂單日 %s 總獎勵點 %s × %s%% = %s，合格 %s 人，每人 %s，實發 %s',
        _date, _total_points, _pool_pct, _pool, _count, _per_head, _payable),
      jsonb_build_object(
        'rule_version', 'v2_batch2_source_order_date',
        'rule_id', 'daily_revenue_bonus_v2',
        'source_order_tw_date', _date,
        'source_reward_points', _total_points,
        'total_base_points', _pool,
        'block_reason', NULL,
        'legacy_tier_code', _member.legacy_code,
        'mapped_tier_code', _mapped,
        'pool_ordinal', _member.pool_ordinal,
        'tier_mapping_source', 'get_effective_vip_tier',
        'redirect_chain', '[]'::jsonb,
        'cap_snapshot', jsonb_build_object(
          'cap', _cap,
          'before', _current_total,
          'after', _current_total + _payable,
          'per_head', _per_head,
          'payable', _payable,
          'capped', _capped_amt
        )
      )
    );

    IF _payable > 0 THEN
      INSERT INTO public.vip_upgrade_bonus_ledger (
        member_id, tier_code, bonus_amount, payable_amount, capped_amount,
        total_before, total_after, cap_amount, status,
        dedupe_key, notes
      ) VALUES (
        _member.member_id, COALESCE(_mapped, _member.legacy_code),
        _per_head, _payable, _capped_amt,
        _current_total, _current_total + _payable, _cap, _status,
        'daily_rev:' || _date::text || ':' || _member.member_id::text,
        '營業分紅'
      )
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;

    _distributed := _distributed + _payable;
    _capped := _capped + _capped_amt;
  END LOOP;

  RETURN QUERY SELECT _date, _total_points, _pool, _count, _per_head, _distributed, _capped;
END;
$function$;

REVOKE ALL ON FUNCTION public.distribute_daily_revenue_bonus(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distribute_daily_revenue_bonus(date) TO authenticated, service_role;

DO $$
DECLARE
  _helper text;
  _revenue text;
BEGIN
  SELECT pg_get_functiondef('public.calculate_daily_order_reward_points_by_source_date(date)'::regprocedure) INTO _helper;
  SELECT pg_get_functiondef('public.distribute_daily_revenue_bonus(date)'::regprocedure) INTO _revenue;

  IF _helper IS NULL THEN RAISE EXCEPTION 'Verification failed: helper function missing'; END IF;
  IF position('GROUP BY br.source_order_id' in _helper) = 0 THEN RAISE EXCEPTION 'Verification failed: helper must dedupe by source_order_id'; END IF;
  IF position('(so.created_at AT TIME ZONE ''Asia/Taipei'')::date = _source_date' in _helper) = 0 THEN RAISE EXCEPTION 'Verification failed: helper must align by source order Taiwan date'; END IF;
  IF position('public.calculate_daily_order_reward_points_by_source_date(_date)' in _revenue) = 0 THEN RAISE EXCEPTION 'Verification failed: revenue bonus must use source-date helper'; END IF;
  IF position('FROM public.point_transactions' in _revenue) > 0 THEN RAISE EXCEPTION 'Verification failed: revenue bonus still reads point_transactions directly'; END IF;
  IF position('''E'',''A''' in _revenue) > 0 THEN RAISE EXCEPTION 'Verification failed: revenue bonus must not include V/S/T/E/A consumption tiers'; END IF;
  IF position('s.user_id' in _revenue) = 0 THEN RAISE EXCEPTION 'Verification failed: revenue bonus must use dealer_tier_status.user_id'; END IF;
END $$;