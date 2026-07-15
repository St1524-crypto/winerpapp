
-- ============================================================
-- 0715-2 新獎金制度 batch 1
-- 只影響 settlement_date >= bonus_rules_effective_from 的新結算
-- 絕不 UPDATE 歷史 bonus_records / reward_wallet_logs / point_transactions
-- ============================================================

-- 1) 新制生效切點
INSERT INTO public.system_settings(key, value, description)
VALUES (
  'bonus_rules_effective_from',
  to_jsonb('2026-07-16'::text),
  '0715-2 新獎金制度生效日；此日起 settle_daily_bonus 走 v2 演算'
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at = now();

-- 2) VIP 有效性三檢查 helper
CREATE OR REPLACE FUNCTION private.is_vip_valid(_member_id uuid, _on date)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _member_id
      AND COALESCE(p.is_vip, false) = true
      AND p.vip_expires_at IS NOT NULL
      AND p.vip_expires_at::date >= _on
  );
$$;

-- 3) VIP 位階：一星 ~ 七星、董事（不動 V/S/T/E/A 現有列）
INSERT INTO public.vip_tiers(
  code, name, sort_order,
  required_reward_points, required_direct_vip,
  required_mentor_tier, required_mentor_count,
  cashback_rate, revenue_share_rate,
  upgrade_bonus_cap, renewal_window_days, renewal_required_new_vip,
  extra_config, description, status
)
VALUES
  ('STAR1','一星',      10, 0, 3,  'E', 3, 0, 0, 0, 0, 0, jsonb_build_object('note','具 E/A 資格且直推 3 位 E'),                                      '一星', 'active'),
  ('STAR2','二星',      11, 0, 0,  'STAR1', 2, 0, 0, 0, 0, 0, jsonb_build_object('note','達一星且直推 2 人完成一星'),                                    '二星', 'active'),
  ('STAR3','三星',      12, 0, 0,  'STAR1', 3, 0, 0, 0, 0, 0, jsonb_build_object('note','達一星且直推 3 人完成一星'),                                    '三星', 'active'),
  ('STAR4','四星',      13, 0, 0,  'STAR1', 4, 0, 0, 0, 0, 0, jsonb_build_object('note','達三星且直推 4 人完成一星'),                                    '四星', 'active'),
  ('STAR5','五星',      14, 0, 0,  'STAR4', 2, 0, 0, 0, 0, 0, jsonb_build_object('note','達四星且直推 2 人完成四星', 'national_pool_cap', 200000),        '五星', 'active'),
  ('STAR6','六星',      15, 0, 0,  'STAR5', 1, 0, 0, 0, 0, 0, jsonb_build_object('note','達五星且直推 1 人完成五星', 'national_pool_cap', 300000),        '六星', 'active'),
  ('STAR7','七星',      16, 0, 0,  'STAR6', 1, 0, 0, 0, 0, 0, jsonb_build_object('note','達六星且直推 1 人完成六星', 'national_pool_cap', 400000),        '七星', 'active'),
  ('DIRECTOR','董事',   17, 0, 0,  'STAR7', 2, 0, 0, 0, 0, 0, jsonb_build_object('note','達七星且直推 2 人完成七星', 'national_pool_cap', 500000),        '董事', 'active')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      sort_order = EXCLUDED.sort_order,
      required_direct_vip = EXCLUDED.required_direct_vip,
      required_mentor_tier = EXCLUDED.required_mentor_tier,
      required_mentor_count = EXCLUDED.required_mentor_count,
      extra_config = public.vip_tiers.extra_config || EXCLUDED.extra_config,
      description = EXCLUDED.description,
      status = EXCLUDED.status,
      updated_at = now();

-- 4) 重寫 settle_daily_bonus — v2 分支
CREATE OR REPLACE FUNCTION public.settle_daily_bonus(_created_by uuid DEFAULT NULL::uuid, _advance_next boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public','private','pg_temp'
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
    -- eligible: v2 對 referral 放寬；由 release_bonus_rewards 沿推薦鏈改發
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
    public.get_member_vip_tier_code(b.member_id),
    (b.bonus_type <> 'repurchase'
     OR COALESCE(mrp.points, 0) >= COALESCE(rr.required_points, _s.vip_required_points, 0))
  FROM public.bonus_records b
  LEFT JOIN public.profiles p ON p.id = b.member_id
  LEFT JOIN public.rank_rebate_settings rr
    ON rr.enabled = true
   AND rr.rank_code = public.map_legacy_rank_to_code(p.legacy_rank)
  LEFT JOIN public.monthly_responsibility_points mrp
    ON mrp.member_id = b.member_id AND mrp.ym = _ym
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
           'rule_version', CASE WHEN _use_v2 THEN 'v2' ELSE 'v1' END,
           'rule_id', 'daily_' || b.bonus_type || CASE WHEN _use_v2 THEN '_v2' ELSE '_v1' END,
           'source_reward_points', b.base_amount,
           'total_base_points', b.base_amount,
           'required_points', p.responsibility_required_points,
           'responsibility_passed', p.responsibility_passed,
           'tier_snapshot', jsonb_build_object('tier_code', p.tier_code, 'bonus_rate', b.bonus_rate),
           'vip_snapshot', jsonb_build_object(
             'is_vip', p.recipient_is_vip,
             'vip_expires_at', p.recipient_vip_expires_at,
             'valid_at_release_date', false
           ),
           'daily_settlement', jsonb_build_object(
             'settlement_date', _today, 'release_date', NULL,
             'eligible', false, 'block_reason', p.block_reason,
             'responsibility_points', p.responsibility_points,
             'responsibility_required_points', p.responsibility_required_points
           ),
           'settlement_date', _today, 'release_date', NULL,
           'eligible_at_daily_settlement', false, 'block_reason', p.block_reason
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
            'rule_version', CASE WHEN _use_v2 THEN 'v2' ELSE 'v1' END,
            'rule_id', 'daily_' || b.bonus_type || CASE WHEN _use_v2 THEN '_v2' ELSE '_v1' END,
            'source_reward_points', b.base_amount,
            'total_base_points', b.base_amount,
            'required_points', p.responsibility_required_points,
            'responsibility_passed', p.responsibility_passed,
            'tier_snapshot', jsonb_build_object('tier_code', p.tier_code, 'bonus_rate', b.bonus_rate),
            'vip_snapshot', jsonb_build_object(
              'is_vip', p.recipient_is_vip,
              'vip_expires_at', p.recipient_vip_expires_at,
              'valid_at_release_date', true
            ),
            'redirect_chain', '[]'::jsonb,
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
            'eligible_at_daily_settlement', true, 'block_reason', NULL
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
    'rule_version', CASE WHEN _use_v2 THEN 'v2' ELSE 'v1' END
  );
END;
$function$;
