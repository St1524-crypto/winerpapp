-- 1) vip_tiers 併入 dealer_tiers 欄位
ALTER TABLE public.vip_tiers
  ADD COLUMN IF NOT EXISTS legacy_code text,
  ADD COLUMN IF NOT EXISTS daily_referral_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upgrade_referral_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rebate_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS operating_bonus_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_points_required numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS global_bonus_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_pv numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_direct_vip integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_mentor_tier text,
  ADD COLUMN IF NOT EXISTS required_mentor_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS condition_logic text NOT NULL DEFAULT 'OR',
  ADD COLUMN IF NOT EXISTS maintenance_window_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maintenance_required_vip integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maintenance_required_new_e_store integer NOT NULL DEFAULT 0;

UPDATE public.vip_tiers v
   SET legacy_code = m.legacy_code
  FROM public.tier_code_mapping m
 WHERE m.vip_tier_code = v.code AND m.is_active = true;

UPDATE public.vip_tiers v
   SET daily_referral_rate = d.daily_referral_rate,
       upgrade_referral_rate = d.upgrade_referral_rate,
       rebate_rate = d.rebate_rate,
       operating_bonus_rate = d.operating_bonus_rate,
       monthly_points_required = d.monthly_points_required,
       global_bonus_rate = d.global_bonus_rate,
       required_pv = d.required_pv,
       required_direct_vip = d.required_direct_vip,
       required_mentor_tier = d.required_mentor_tier,
       required_mentor_count = d.required_mentor_count,
       condition_logic = d.condition_logic,
       maintenance_window_days = d.maintenance_window_days,
       maintenance_required_vip = d.maintenance_required_vip,
       maintenance_required_new_e_store = d.maintenance_required_new_e_store
  FROM public.dealer_tiers d
 WHERE d.code = v.legacy_code;

ALTER TABLE public.vip_tiers
  ADD CONSTRAINT vip_tiers_legacy_code_key UNIQUE (legacy_code);

-- 2) dealer_tier_status 外鍵改指向 vip_tiers.legacy_code（會員位階值不變）
ALTER TABLE public.dealer_tier_status
  DROP CONSTRAINT IF EXISTS dealer_tier_status_current_tier_fkey;
ALTER TABLE public.dealer_tier_status
  ADD CONSTRAINT dealer_tier_status_current_tier_fkey
  FOREIGN KEY (current_tier) REFERENCES public.vip_tiers(legacy_code);

-- 3) 每日營業分紅改讀 vip_tiers
DO $mig$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d
    FROM pg_proc WHERE proname = 'distribute_daily_revenue_bonus' AND prokind = 'f' LIMIT 1;
  d := replace(d,
    'LEFT JOIN public.dealer_tiers t ON t.code = s.current_tier',
    'LEFT JOIN public.vip_tiers t ON t.legacy_code = s.current_tier');
  EXECUTE d;
END $mig$;

-- 4) 日結不再處理複購（改為月結）
DO $mig$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d
    FROM pg_proc WHERE proname = 'settle_daily_bonus_for_date' AND prokind = 'f' LIMIT 1;
  d := replace(d,
    'AND b.bonus_type IN (''referral'',''repurchase'')',
    'AND b.bonus_type = ''referral''');
  EXECUTE d;
END $mig$;

-- 5) 複購月結函式
CREATE OR REPLACE FUNCTION public.settle_monthly_repurchase(
  _ym text,
  _batch_id uuid,
  _settle_date date,
  _release_date date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _s public.bonus_settings;
  _settled int := 0;
  _cancelled int := 0;
  _points int := 0;
BEGIN
  SELECT * INTO _s FROM public.bonus_settings ORDER BY created_at LIMIT 1;

  CREATE TEMP TABLE IF NOT EXISTS monthly_repurchase_pending (
    id uuid PRIMARY KEY,
    member_id uuid,
    bonus_points integer,
    eligible boolean,
    block_reason text,
    responsibility_points numeric,
    required_points numeric
  ) ON COMMIT DROP;
  TRUNCATE monthly_repurchase_pending;

  INSERT INTO monthly_repurchase_pending
  SELECT
    b.id,
    b.member_id,
    COALESCE(b.bonus_points, 0),
    CASE
      WHEN p.id IS NULL THEN false
      WHEN COALESCE(p.is_vip, false) IS NOT true THEN false
      WHEN p.vip_expires_at IS NULL THEN false
      WHEN p.vip_expires_at::date < _release_date THEN false
      WHEN COALESCE(mrp.points, 0) < COALESCE(rr.required_points, _s.vip_required_points, 0) THEN false
      ELSE true
    END,
    CASE
      WHEN p.id IS NULL THEN 'recipient profile missing'
      WHEN COALESCE(p.is_vip, false) IS NOT true THEN 'recipient is not VIP'
      WHEN p.vip_expires_at IS NULL THEN 'VIP expiry missing; treated as expired'
      WHEN p.vip_expires_at::date < _release_date THEN 'VIP expired before reward release date'
      WHEN COALESCE(mrp.points, 0) < COALESCE(rr.required_points, _s.vip_required_points, 0)
        THEN format('monthly responsibility not completed: %s/%s (repurchase forfeited)',
          COALESCE(mrp.points, 0), COALESCE(rr.required_points, _s.vip_required_points, 0))
      ELSE NULL
    END,
    COALESCE(mrp.points, 0),
    COALESCE(rr.required_points, _s.vip_required_points, 0)
  FROM public.bonus_records b
  LEFT JOIN public.sales_orders so ON so.id = b.source_order_id
  LEFT JOIN public.profiles p ON p.id = b.member_id
  LEFT JOIN public.rank_rebate_settings rr
    ON rr.enabled = true
   AND rr.rank_code = public.map_legacy_rank_to_code(p.legacy_rank)
  LEFT JOIN public.monthly_responsibility_points mrp
    ON mrp.member_id = b.member_id AND mrp.ym = _ym
  WHERE b.status = 'pending'
    AND b.bonus_type = 'repurchase'
    AND to_char(
          COALESCE((so.created_at AT TIME ZONE 'Asia/Taipei')::date,
                   (b.created_at AT TIME ZONE 'Asia/Taipei')::date),
          'YYYYMM') = _ym;

  UPDATE public.bonus_records b
     SET status = 'cancelled',
         bonus_points = 0,
         required_points_checked = true,
         required_points_passed = false,
         fail_reason = q.block_reason,
         settlement_batch_id = _batch_id,
         settlement_date = _settle_date,
         release_date = NULL,
         calculation_detail = COALESCE(b.calculation_detail, '{}'::jsonb) || jsonb_build_object(
           'settlement_source', 'settle_monthly_repurchase',
           'rule_id', 'monthly_repurchase_v1',
           'period', _ym,
           'responsibility_snapshot', jsonb_build_object(
             'ym', _ym,
             'points', q.responsibility_points,
             'required_points', q.required_points,
             'passed', false
           ),
           'block_reason', q.block_reason,
           'settlement_date', _settle_date,
           'release_date', NULL
         ),
         updated_at = now()
    FROM monthly_repurchase_pending q
   WHERE b.id = q.id AND q.eligible = false AND b.status = 'pending';
  GET DIAGNOSTICS _cancelled = ROW_COUNT;

  UPDATE public.bonus_records b
     SET status = 'waiting_release',
         required_points_checked = true,
         required_points_passed = true,
         fail_reason = NULL,
         settlement_batch_id = _batch_id,
         settlement_date = _settle_date,
         release_date = _release_date,
         calculation_detail = COALESCE(b.calculation_detail, '{}'::jsonb) || jsonb_build_object(
           'settlement_source', 'settle_monthly_repurchase',
           'rule_id', 'monthly_repurchase_v1',
           'period', _ym,
           'responsibility_snapshot', jsonb_build_object(
             'ym', _ym,
             'points', q.responsibility_points,
             'required_points', q.required_points,
             'passed', true
           ),
           'block_reason', NULL,
           'settlement_batch_id', _batch_id,
           'settlement_date', _settle_date,
           'release_date', _release_date
         ),
         updated_at = now()
    FROM monthly_repurchase_pending q
   WHERE b.id = q.id AND q.eligible = true AND b.status = 'pending';
  GET DIAGNOSTICS _settled = ROW_COUNT;

  SELECT COALESCE(SUM(bonus_points), 0)::int INTO _points
    FROM monthly_repurchase_pending WHERE eligible = true;

  RETURN jsonb_build_object(
    'settled', _settled,
    'cancelled', _cancelled,
    'points', _points
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.settle_monthly_repurchase(text, uuid, date, date) FROM PUBLIC, anon, authenticated;

-- 6) 月結算流程加入複購結算
DO $mig$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d
    FROM pg_proc WHERE proname = 'settle_monthly_bonus' AND prokind = 'f' LIMIT 1;
  d := replace(d,
    '  -- National share is a monthly bonus in v3.',
    '  PERFORM public.settle_monthly_repurchase(_ym, _batch_id, _settle_date, _release_date);' || chr(10) ||
    chr(10) || '  -- National share is a monthly bonus in v3.');
  EXECUTE d;
END $mig$;

-- 7) 取消未發放的消費回饋（cashback）紀錄，並移除回饋率欄位
UPDATE public.bonus_records
   SET status = 'cancelled',
       bonus_points = 0,
       release_date = NULL,
       fail_reason = 'cashback bonus removed from compensation plan',
       updated_at = now()
 WHERE bonus_type = 'cashback'
   AND status IN ('pending', 'waiting_release');

DROP VIEW IF EXISTS public.vip_tiers_public;

ALTER TABLE public.vip_tiers DROP COLUMN IF EXISTS cashback_rate;

CREATE VIEW public.vip_tiers_public
WITH (security_invoker = on) AS
SELECT id, code, name, sort_order, status,
       revenue_share_rate, business_bonus_rate, business_bonus_cap_amount,
       upgrade_bonus_cap, upgrade_bonus_cap_amount, upgrade_bonus_cap_basis,
       upgrade_total_earnings_cap_amount
  FROM public.vip_tiers
 WHERE status = 'active';

GRANT SELECT ON public.vip_tiers_public TO anon, authenticated, service_role;

-- 8) 移除舊制經銷位階表
DROP VIEW IF EXISTS public.dealer_tiers_public_summary;
DROP TABLE IF EXISTS public.dealer_tiers;