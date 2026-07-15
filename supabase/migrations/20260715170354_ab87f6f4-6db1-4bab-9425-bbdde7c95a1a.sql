-- ============================================================
-- Batch 2C-1: VIP shared pool selection via effective tier mapping
-- ============================================================

-- 1) calculation_detail column on payouts (audit snapshot)
ALTER TABLE public.vip_bonus_pool_payouts
  ADD COLUMN IF NOT EXISTS calculation_detail jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Ensure idempotency key exists (pool + date + member unique)
CREATE UNIQUE INDEX IF NOT EXISTS vip_bonus_pool_payouts_pool_date_member_uidx
  ON public.vip_bonus_pool_payouts (pool_id, payout_date, member_id);

-- 2) Helper: list members whose effective tier matches pool.tier_codes
CREATE OR REPLACE FUNCTION private.list_pool_eligible_members(
  _pool_id uuid,
  _on date
)
RETURNS TABLE(
  member_id uuid,
  legacy_code text,
  mapped_code text,
  pool_ordinal text,
  tier_mapping_source text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $fn$
DECLARE
  _codes text[];
  _status text;
BEGIN
  SELECT tier_codes, status INTO _codes, _status
  FROM public.vip_bonus_pools WHERE id = _pool_id;
  IF _codes IS NULL OR array_length(_codes,1) IS NULL THEN
    RETURN;
  END IF;
  IF _status IS NOT NULL AND _status <> 'active' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.member_id,
         ev.legacy_code,
         ev.vip_tier_code,
         ev.pool_ordinal,
         'get_effective_vip_tier'::text
  FROM public.dealer_tier_status s
  LEFT JOIN LATERAL private.get_effective_vip_tier(s.member_id, _on) ev ON true
  WHERE ev.vip_tier_code IS NOT NULL
    AND private.pool_tier_matches(_codes, ev.legacy_code);
END;
$fn$;

REVOKE ALL ON FUNCTION private.list_pool_eligible_members(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.list_pool_eligible_members(uuid, date) TO service_role;

-- 3) Distributor: writes vip_bonus_pool_payouts with audit snapshot
CREATE OR REPLACE FUNCTION public.distribute_vip_bonus_pool_daily(
  _pool_id uuid,
  _settlement_date date DEFAULT (CURRENT_DATE - 1),
  _daily_total_reward_points numeric DEFAULT 0
)
RETURNS TABLE(
  pool_id uuid,
  payout_date date,
  eligible_count integer,
  pool_amount numeric,
  per_head_amount numeric,
  distributed_count integer,
  skipped_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $fn$
DECLARE
  _pool public.vip_bonus_pools;
  _calc record;
  _member record;
  _count integer := 0;
  _distributed integer := 0;
  _skipped integer := 0;
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

  SELECT * INTO _pool FROM public.vip_bonus_pools WHERE id = _pool_id;
  IF _pool.id IS NULL THEN
    RAISE EXCEPTION 'pool not found';
  END IF;

  -- Count eligible members via mapping-aware selector
  SELECT count(*)::int INTO _count
  FROM private.list_pool_eligible_members(_pool_id, _settlement_date);

  SELECT * INTO _calc
  FROM public.calc_vip_bonus_pool_daily(_pool_id, COALESCE(_daily_total_reward_points,0), _count);

  FOR _member IN
    SELECT * FROM private.list_pool_eligible_members(_pool_id, _settlement_date)
    ORDER BY member_id
  LOOP
    -- Idempotent: skip if a payout already exists for this pool/date/member
    IF EXISTS (
      SELECT 1 FROM public.vip_bonus_pool_payouts
      WHERE pool_id = _pool_id
        AND payout_date = _settlement_date
        AND member_id = _member.member_id
    ) THEN
      _skipped := _skipped + 1;
      CONTINUE;
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
      _calc.per_member_amount, _calc.per_member_amount, 0,
      0, _calc.per_member_amount, COALESCE(_pool.total_income_cap_amount, 0),
      _calc.status,
      format('VIP pool %s：池 %s × %s = %s ÷ %s 人 = %s',
        _pool.code, COALESCE(_daily_total_reward_points,0), _calc.bonus_rate,
        _calc.pool_amount, _count, _calc.per_member_amount),
      jsonb_build_object(
        'rule_version','v2_batch2_pool_mapping',
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
        'distributed_points', _calc.per_member_amount,
        'block_reason', NULL,
        'vip_snapshot', jsonb_build_object(
          'legacy_tier_code', _member.legacy_code,
          'mapped_tier_code', _member.mapped_code
        )
      ),
      _uid
    );
    _distributed := _distributed + 1;
  END LOOP;

  RETURN QUERY SELECT _pool_id, _settlement_date, _count,
                      _calc.pool_amount, _calc.per_member_amount,
                      _distributed, _skipped;
END;
$fn$;

REVOKE ALL ON FUNCTION public.distribute_vip_bonus_pool_daily(uuid, date, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.distribute_vip_bonus_pool_daily(uuid, date, numeric) TO service_role;