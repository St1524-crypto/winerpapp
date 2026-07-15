
-- ============================================================
-- Batch 2B: switch daily bonus v2 to effective tier mapping
-- ============================================================

-- 0. ledger 補欄位（不影響歷史 row 內容）
ALTER TABLE public.vip_daily_revenue_bonus_ledger
  ADD COLUMN IF NOT EXISTS calculation_detail jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 1. helper：pool.tier_codes 對映
CREATE OR REPLACE FUNCTION private.pool_tier_matches(_pool_codes text[], _legacy_code text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _mapped text;
  _ordinal text;
  _c text;
BEGIN
  IF _pool_codes IS NULL OR array_length(_pool_codes,1) IS NULL OR _legacy_code IS NULL THEN
    RETURN false;
  END IF;

  SELECT vip_tier_code, pool_ordinal
    INTO _mapped, _ordinal
  FROM public.tier_code_mapping
  WHERE legacy_code = _legacy_code AND is_active = true
  LIMIT 1;

  -- 若無 mapping，直接以原碼比對
  IF _mapped IS NULL THEN _mapped := _legacy_code; END IF;

  FOREACH _c IN ARRAY _pool_codes LOOP
    IF _c IS NULL THEN CONTINUE; END IF;
    IF _c = _legacy_code THEN RETURN true; END IF;    -- 舊碼直接命中
    IF _c = _mapped THEN RETURN true; END IF;         -- 新星級碼命中
    IF _ordinal IS NOT NULL AND _c = _ordinal THEN RETURN true; END IF; -- 純數字/D 命中
  END LOOP;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION private.pool_tier_matches(text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.pool_tier_matches(text[], text) TO authenticated, service_role;

-- 2. settle_daily_bonus：只換 v2 分支的位階讀取來源 + 補 calculation_detail 欄位
CREATE OR REPLACE FUNCTION public.settle_daily_bonus(_created_by uuid DEFAULT NULL::uuid, _advance_next boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
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
  _effective_from date;
  _use_v2 boolean;
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

  SELECT (value #>> '{}')::date INTO _effective_from
  FROM public.system_settings WHERE key = 'bonus_rules_effective_from';
  _use_v2 := (_effective_from IS NOT NULL AND _today >= _effective_from);

  CREATE TEMP TABLE IF NOT EXISTS daily_bonus_pending (
    id uuid PRIMARY KEY,
    member_id uuid,
    bonus_points integer,
    bonus_type text,
    base_amount numeric,
    bonus_rate numeric,
    source_order_id uuid,
    source_member_id uuid,
    eligible boolean,
    block_reason text,
    recipient_is_vip boolean,
    recipient_vip_expires_at timestamptz,
    responsibility_points numeric,
    responsibility_required_points numeric,
    tier_code text,
    legacy_tier_code text,
    mapped_tier_code text,
    pool_ordinal text,
    tier_mapping_source text,
    responsibility_passed boolean
  ) ON COMMIT DROP;
  TRUNCATE daily_bonus_pending;

  INSERT INTO daily_bonus_pending
  SELECT
    b.id,
    b.member_id,
    COALESCE(b.bonus_points, 0),
    b.bonus_type,
    b.base_amount,
    b.bonus_rate,
    b.source_order_id,
    b.source_member_id,
    CASE
      WHEN _use_v2 AND b.bonus_type = 'referral' THEN true
      WHEN p.id IS NULL THEN false
      WHEN COALESCE(p.is_vip, false) IS NOT true THEN false
      WHEN p.vip_expires_at IS NULL THEN false
      WHEN p.vip_expires_at::date < _release_date THEN false
      WHEN b.bonus_type = 'repurchase'
        AND COALESCE(mrp.points, 0) < COALESCE(rr.required_points, _s.vip_required_points, 0) THEN false
      ELSE true
    END,
    CASE
      WHEN _use_v2 AND b.bonus_type = 'referral' THEN NULL
      WHEN p.id IS NULL THEN 'recipient profile missing'
      WHEN COALESCE(p.is_vip, false) IS NOT true THEN 'recipient is not VIP'
      WHEN p.vip_expires_at IS NULL THEN 'VIP expiry missing; treated as expired'
      WHEN p.vip_expires_at::date < _release_date THEN 'VIP expired before reward release date'
      WHEN b.bonus_type = 'repurchase'
        AND COALESCE(mrp.points, 0) < COALESCE(rr.required_points, _s.vip_required_points, 0)
        THEN format('monthly responsibility not completed: %s/%s',
          COALESCE(mrp.points, 0), COALESCE(rr.required_points, _s.vip_required_points, 0))
      ELSE NULL
    END,
    COALESCE(p.is_vip, false),
    p.vip_expires_at,
    COALESCE(mrp.points, 0),
    COALESCE(rr.required_points, _s.vip_required_points, 0),
    -- 位階讀取：v2 走 mapping helper；v1 保留原邏輯
    CASE WHEN _use_v2 THEN COALESCE(ev.vip_tier_code, public.get_member_vip_tier_code(b.member_id))
         ELSE public.get_member_vip_tier_code(b.member_id) END,
    ev.legacy_code,
    ev.vip_tier_code,
    ev.pool_ordinal,
    CASE WHEN _use_v2 THEN 'get_effective_vip_tier' ELSE 'get_member_vip_tier_code' END,
    (b.bonus_type <> 'repurchase'
     OR COALESCE(mrp.points, 0) >= COALESCE(rr.required_points, _s.vip_required_points, 0))
  FROM public.bonus_records b
  LEFT JOIN public.profiles p ON p.id = b.member_id
  LEFT JOIN public.rank_rebate_settings rr
    ON rr.enabled = true
   AND rr.rank_code = public.map_legacy_rank_to_code(p.legacy_rank)
  LEFT JOIN public.monthly_responsibility_points mrp
    ON mrp.member_id = b.member_id AND mrp.ym = _ym
  LEFT JOIN LATERAL private.get_effective_vip_tier(b.member_id, _today) ev ON true
  WHERE b.status = 'pending'
    AND b.bonus_type IN ('referral','repurchase','rank_rebate')
  ORDER BY b.created_at
  LIMIT 5000
  FOR UPDATE OF b SKIP LOCKED;

  -- 不合格：僅寫 calculation_detail，不動 wallet / point_transactions
  UPDATE public.bonus_records b
     SET status = 'cancelled',
         bonus_points = 0,
         required_points_checked = true,
         required_points_passed = false,
         fail_reason = p.block_reason,
         settlement_date = _today,
         release_date = NULL,
         calculation_detail = COALESCE(b.calculation_detail, '{}'::jsonb) || jsonb_build_object(
           'schema_version', CASE WHEN _use_v2 THEN 2 ELSE 1 END,
           'rule_version', CASE WHEN _use_v2 THEN 'v2_batch2' ELSE 'v1' END,
           'rule_id', 'daily_' || b.bonus_type || CASE WHEN _use_v2 THEN '_v2' ELSE '_v1' END,
           'source_reward_points', b.base_amount,
           'total_base_points', b.base_amount,
           'required_points', p.responsibility_required_points,
           'responsibility_passed', p.responsibility_passed,
           'responsibility_snapshot', jsonb_build_object(
             'ym', _ym,
             'points', p.responsibility_points,
             'required_points', p.responsibility_required_points,
             'passed', p.responsibility_passed
           ),
           'tier_snapshot', jsonb_build_object('tier_code', p.tier_code, 'bonus_rate', b.bonus_rate),
           'legacy_tier_code', p.legacy_tier_code,
           'mapped_tier_code', p.mapped_tier_code,
           'pool_ordinal', p.pool_ordinal,
           'tier_mapping_source', p.tier_mapping_source,
           'vip_snapshot', jsonb_build_object(
             'is_vip', p.recipient_is_vip,
             'vip_expires_at', p.recipient_vip_expires_at,
             'valid_at_release_date', false
           ),
           'redirect_chain', '[]'::jsonb,
           'block_reason', p.block_reason,
           'daily_settlement', jsonb_build_object(
             'settlement_date', _today, 'release_date', NULL,
             'eligible', false, 'block_reason', p.block_reason,
             'responsibility_points', p.responsibility_points,
             'responsibility_required_points', p.responsibility_required_points
           ),
           'settlement_date', _today, 'release_date', NULL,
           'eligible_at_daily_settlement', false
         ),
         updated_at = now()
  FROM daily_bonus_pending p
  WHERE b.id = p.id AND p.eligible = false;

  GET DIAGNOSTICS _cancelled_count = ROW_COUNT;

  SELECT count(*), count(DISTINCT member_id), COALESCE(sum(bonus_points), 0)::int
    INTO _eligible_count, _members, _total_points
  FROM daily_bonus_pending WHERE eligible = true;

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
          calculation_detail = COALESCE(b.calculation_detail, '{}'::jsonb) || jsonb_build_object(
            'schema_version', CASE WHEN _use_v2 THEN 2 ELSE 1 END,
            'rule_version', CASE WHEN _use_v2 THEN 'v2_batch2' ELSE 'v1' END,
            'rule_id', 'daily_' || b.bonus_type || CASE WHEN _use_v2 THEN '_v2' ELSE '_v1' END,
            'source_reward_points', b.base_amount,
            'total_base_points', b.base_amount,
            'required_points', p.responsibility_required_points,
            'responsibility_passed', p.responsibility_passed,
            'responsibility_snapshot', jsonb_build_object(
              'ym', _ym,
              'points', p.responsibility_points,
              'required_points', p.responsibility_required_points,
              'passed', p.responsibility_passed
            ),
            'tier_snapshot', jsonb_build_object('tier_code', p.tier_code, 'bonus_rate', b.bonus_rate),
            'legacy_tier_code', p.legacy_tier_code,
            'mapped_tier_code', p.mapped_tier_code,
            'pool_ordinal', p.pool_ordinal,
            'tier_mapping_source', p.tier_mapping_source,
            'vip_snapshot', jsonb_build_object(
              'is_vip', p.recipient_is_vip,
              'vip_expires_at', p.recipient_vip_expires_at,
              'valid_at_release_date', true
            ),
            'redirect_chain', '[]'::jsonb,
            'block_reason', NULL,
            'cap_snapshot', null,
            'daily_settlement', jsonb_build_object(
              'settlement_batch_id', _batch_id,
              'settlement_date', _today, 'release_date', _release_date,
              'eligible', true, 'block_reason', NULL,
              'responsibility_points', p.responsibility_points,
              'responsibility_required_points', p.responsibility_required_points
            ),
            'settlement_batch_id', _batch_id,
            'settlement_date', _today, 'release_date', _release_date,
            'eligible_at_daily_settlement', true
          ),
          updated_at = now()
    FROM daily_bonus_pending p
    WHERE b.id = p.id AND p.eligible = true;

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
    'ok', true, 'count', _eligible_count, 'cancelled', _cancelled_count,
    'batch_id', _batch_id, 'points', _total_points, 'release_date', _release_date,
    'rule_version', CASE WHEN _use_v2 THEN 'v2_batch2' ELSE 'v1' END
  );
END;
$function$;

-- 3. distribute_daily_revenue_bonus：mapping + 180 天無新推 VIP 停發
CREATE OR REPLACE FUNCTION public.distribute_daily_revenue_bonus(_date date DEFAULT (CURRENT_DATE - 1))
RETURNS TABLE(distribution_date date, total_reward_points numeric, pool_amount numeric, eligible_count integer, per_head_amount numeric, distributed_amount numeric, capped_total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  _total_points NUMERIC := 0;
  _pool NUMERIC := 0;
  _count INTEGER := 0;
  _per_head NUMERIC := 0;
  _distributed NUMERIC := 0;
  _capped NUMERIC := 0;
  _pool_pct NUMERIC := 5;
  _member RECORD;
  _cap NUMERIC;
  _current_total NUMERIC;
  _remaining NUMERIC;
  _payable NUMERIC;
  _capped_amt NUMERIC;
  _status TEXT;
  _mapped TEXT;
  _has_recent_ref BOOLEAN;
  _block TEXT;
BEGIN
  -- 當日訂單獎勵點
  SELECT COALESCE(SUM(amount), 0) INTO _total_points
  FROM public.point_transactions
  WHERE point_type = 'reward'
    AND source IN ('order_earn', 'order_earn_referrer')
    AND created_at >= _date::timestamptz
    AND created_at < (_date + 1)::timestamptz;

  _pool := ROUND(_total_points * _pool_pct / 100.0, 0);

  -- 候選人：舊 V1~V8 + 新 STAR1~DIRECTOR + E/A（透過 mapping 統一判斷）
  CREATE TEMP TABLE IF NOT EXISTS drb_candidates (
    member_id uuid PRIMARY KEY,
    legacy_code text,
    mapped_code text,
    pool_ordinal text,
    cap numeric,
    block_reason text
  ) ON COMMIT DROP;
  TRUNCATE drb_candidates;

  INSERT INTO drb_candidates(member_id, legacy_code, mapped_code, pool_ordinal, cap, block_reason)
  SELECT s.member_id,
         ev.legacy_code,
         ev.vip_tier_code,
         ev.pool_ordinal,
         COALESCE(t.upgrade_bonus_cap, 0),
         NULL
  FROM public.dealer_tier_status s
  LEFT JOIN LATERAL private.get_effective_vip_tier(s.member_id, _date) ev ON true
  LEFT JOIN public.dealer_tiers t ON t.code = s.current_tier
  WHERE ev.vip_tier_code IN ('STAR1','STAR2','STAR3','STAR4','STAR5','STAR6','STAR7','DIRECTOR','E','A');

  -- 180 天內未新推 1 位 VIP：E/A 停發
  UPDATE drb_candidates c
     SET block_reason = 'no_new_referral_vip_180d'
   WHERE c.mapped_code IN ('E','A')
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles d
       WHERE d.referred_by = c.member_id
         AND COALESCE(d.is_vip,false) = true
         AND d.created_at >= (_date - INTERVAL '180 days')::timestamptz
     );

  SELECT COUNT(*) INTO _count FROM drb_candidates WHERE block_reason IS NULL;

  IF _count = 0 OR _pool <= 0 THEN
    RETURN QUERY SELECT _date, _total_points, _pool, _count, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  _per_head := ROUND(_pool / _count, 0);

  FOR _member IN
    SELECT member_id, legacy_code, mapped_code, pool_ordinal, cap, block_reason
    FROM drb_candidates
    ORDER BY member_id
  LOOP
    IF EXISTS (SELECT 1 FROM public.vip_daily_revenue_bonus_ledger
               WHERE distribution_date = _date AND member_id = _member.member_id) THEN
      CONTINUE;
    END IF;

    _mapped := _member.mapped_code;
    _block := _member.block_reason;

    IF _block IS NOT NULL THEN
      -- 停發：僅寫 ledger 說明，不寫 upgrade_bonus_ledger、不動 wallet
      INSERT INTO public.vip_daily_revenue_bonus_ledger (
        distribution_date, member_id, tier_code,
        daily_total_reward_points, pool_percentage, eligible_member_count,
        allocated_amount, payable_amount, capped_amount,
        total_before, total_after, cap_amount, status,
        notes, calculation_detail
      ) VALUES (
        _date, _member.member_id, COALESCE(_mapped, _member.legacy_code),
        _total_points, _pool_pct, _count,
        0, 0, 0,
        0, 0, COALESCE(_member.cap, 0), 'skipped',
        format('停發：%s', _block),
        jsonb_build_object(
          'rule_version','v2_batch2',
          'rule_id','daily_revenue_bonus_v2',
          'block_reason', _block,
          'legacy_tier_code', _member.legacy_code,
          'mapped_tier_code', _mapped,
          'pool_ordinal', _member.pool_ordinal,
          'tier_mapping_source','get_effective_vip_tier',
          'source_reward_points', _total_points,
          'total_base_points', _pool,
          'redirect_chain','[]'::jsonb
        )
      );
      CONTINUE;
    END IF;

    _cap := COALESCE(_member.cap, 0);

    SELECT COALESCE(SUM(payable_amount), 0) INTO _current_total
    FROM public.vip_upgrade_bonus_ledger
    WHERE member_id = _member.member_id
      AND status IN ('released','partial_capped');

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
      format('每日營業分紅：池 %s × 5%% = %s ÷ %s 人 = %s，實發 %s', _total_points, _pool, _count, _per_head, _payable),
      jsonb_build_object(
        'rule_version','v2_batch2',
        'rule_id','daily_revenue_bonus_v2',
        'block_reason', NULL,
        'legacy_tier_code', _member.legacy_code,
        'mapped_tier_code', _mapped,
        'pool_ordinal', _member.pool_ordinal,
        'tier_mapping_source','get_effective_vip_tier',
        'source_reward_points', _total_points,
        'total_base_points', _pool,
        'redirect_chain','[]'::jsonb,
        'cap_snapshot', jsonb_build_object(
          'cap', _cap, 'before', _current_total, 'after', _current_total + _payable,
          'per_head', _per_head, 'payable', _payable, 'capped', _capped_amt
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
        '每日營業分紅池分配'
      )
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;

    _distributed := _distributed + _payable;
    _capped := _capped + _capped_amt;
  END LOOP;

  RETURN QUERY SELECT _date, _total_points, _pool, _count, _per_head, _distributed, _capped;
END;
$function$;
