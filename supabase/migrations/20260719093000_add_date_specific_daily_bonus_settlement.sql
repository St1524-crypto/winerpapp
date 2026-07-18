-- Add a safe date-specific daily bonus settlement RPC.
--
-- Purpose:
--   The cron daily settlement uses Taiwan "today" inside settle_daily_bonus().
--   If a cron run is missed, calling that RPC later stamps the later date.
--   This function lets admins preview or apply settlement for a specific date
--   without recalculating order rewards and without touching wallet ledgers.
--
-- Safety:
--   - Defaults to dry-run.
--   - Only selects pending referral / repurchase bonus_records for the requested
--     source date.
--   - Does not write member_points_wallet, reward_wallet_logs, or
--     point_transactions.
--   - Does not advance daily_next_settlement_at.

CREATE OR REPLACE FUNCTION public.settle_daily_bonus_for_date(
  _settlement_date date,
  _created_by uuid DEFAULT NULL::uuid,
  _dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  _s public.bonus_settings;
  _today_tw date := (now() AT TIME ZONE 'Asia/Taipei')::date;
  _ym text;
  _release_date date;
  _batch_id uuid;
  _eligible_count int := 0;
  _blocked_count int := 0;
  _updated_eligible int := 0;
  _updated_blocked int := 0;
  _total_points int := 0;
  _members int := 0;
  _uid uuid := auth.uid();
  _effective_from date;
  _use_v2 boolean;
  _by_type jsonb := '[]'::jsonb;
  _sample jsonb := '[]'::jsonb;
BEGIN
  IF _settlement_date IS NULL THEN
    RAISE EXCEPTION 'settlement date is required';
  END IF;

  IF _settlement_date > _today_tw THEN
    RAISE EXCEPTION 'cannot settle a future daily bonus date';
  END IF;

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

  _ym := to_char(_settlement_date, 'YYYYMM');
  _release_date := _settlement_date + GREATEST(COALESCE(_s.reward_release_days, 0), 0);

  SELECT (value #>> '{}')::date INTO _effective_from
  FROM public.system_settings
  WHERE key = 'bonus_rules_effective_from';
  _use_v2 := (_effective_from IS NOT NULL AND _settlement_date >= _effective_from);

  CREATE TEMP TABLE IF NOT EXISTS daily_bonus_for_date_pending (
    id uuid PRIMARY KEY,
    member_id uuid,
    bonus_points integer,
    bonus_type text,
    base_amount numeric,
    bonus_rate numeric,
    source_order_id uuid,
    source_member_id uuid,
    source_date date,
    source_date_basis text,
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
  TRUNCATE daily_bonus_for_date_pending;

  INSERT INTO daily_bonus_for_date_pending
  SELECT
    b.id,
    b.member_id,
    COALESCE(b.bonus_points, 0),
    b.bonus_type,
    b.base_amount,
    b.bonus_rate,
    b.source_order_id,
    b.source_member_id,
    COALESCE((so.created_at AT TIME ZONE 'Asia/Taipei')::date, (b.created_at AT TIME ZONE 'Asia/Taipei')::date),
    CASE WHEN so.id IS NOT NULL THEN 'sales_orders.created_at' ELSE 'bonus_records.created_at' END,
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
    CASE WHEN _use_v2 THEN COALESCE(ev.vip_tier_code, public.get_member_vip_tier_code(b.member_id))
         ELSE public.get_member_vip_tier_code(b.member_id) END,
    ev.legacy_code,
    ev.vip_tier_code,
    ev.pool_ordinal,
    CASE WHEN _use_v2 THEN 'get_effective_vip_tier' ELSE 'get_member_vip_tier_code' END,
    (b.bonus_type <> 'repurchase'
     OR COALESCE(mrp.points, 0) >= COALESCE(rr.required_points, _s.vip_required_points, 0))
  FROM public.bonus_records b
  LEFT JOIN public.sales_orders so ON so.id = b.source_order_id
  LEFT JOIN public.profiles p ON p.id = b.member_id
  LEFT JOIN public.rank_rebate_settings rr
    ON rr.enabled = true
   AND rr.rank_code = public.map_legacy_rank_to_code(p.legacy_rank)
  LEFT JOIN public.monthly_responsibility_points mrp
    ON mrp.member_id = b.member_id AND mrp.ym = _ym
  LEFT JOIN LATERAL private.get_effective_vip_tier(b.member_id, _settlement_date) ev ON true
  WHERE b.status = 'pending'
    AND b.bonus_type IN ('referral','repurchase')
    AND COALESCE((so.created_at AT TIME ZONE 'Asia/Taipei')::date, (b.created_at AT TIME ZONE 'Asia/Taipei')::date) = _settlement_date
  ORDER BY b.created_at
  LIMIT 5000
  FOR UPDATE OF b SKIP LOCKED;

  SELECT count(*), count(DISTINCT member_id), COALESCE(sum(bonus_points), 0)::int
    INTO _eligible_count, _members, _total_points
  FROM daily_bonus_for_date_pending
  WHERE eligible = true;

  SELECT count(*) INTO _blocked_count
  FROM daily_bonus_for_date_pending
  WHERE eligible = false;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bonus_type', bonus_type,
           'eligible', eligible,
           'count', cnt,
           'points', points
         ) ORDER BY bonus_type, eligible), '[]'::jsonb)
    INTO _by_type
  FROM (
    SELECT bonus_type, eligible, count(*)::int AS cnt, COALESCE(sum(bonus_points), 0)::int AS points
    FROM daily_bonus_for_date_pending
    GROUP BY bonus_type, eligible
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', id,
           'member_id', member_id,
           'bonus_type', bonus_type,
           'bonus_points', bonus_points,
           'source_order_id', source_order_id,
           'source_date', source_date,
           'source_date_basis', source_date_basis,
           'eligible', eligible,
           'block_reason', block_reason
         ) ORDER BY id), '[]'::jsonb)
    INTO _sample
  FROM (
    SELECT *
    FROM daily_bonus_for_date_pending
    ORDER BY source_date, bonus_type, id
    LIMIT 20
  ) s;

  IF _dry_run THEN
    RETURN jsonb_build_object(
      'ok', true,
      'dry_run', true,
      'settlement_date', _settlement_date,
      'release_date', _release_date,
      'would_settle', _eligible_count,
      'would_cancel', _blocked_count,
      'members', _members,
      'points', _total_points,
      'by_type', _by_type,
      'sample', _sample,
      'rule_version', CASE WHEN _use_v2 THEN 'v2_batch2' ELSE 'v1' END
    );
  END IF;

  UPDATE public.bonus_records b
     SET status = 'cancelled',
         bonus_points = 0,
         required_points_checked = true,
         required_points_passed = false,
         fail_reason = p.block_reason,
         settlement_date = _settlement_date,
         release_date = NULL,
         calculation_detail = COALESCE(b.calculation_detail, '{}'::jsonb) || jsonb_build_object(
           'schema_version', CASE WHEN _use_v2 THEN 2 ELSE 1 END,
           'rule_version', CASE WHEN _use_v2 THEN 'v2_batch2' ELSE 'v1' END,
           'rule_id', 'daily_' || b.bonus_type || CASE WHEN _use_v2 THEN '_v2' ELSE '_v1' END,
           'settlement_source', 'settle_daily_bonus_for_date',
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
           'source_date', p.source_date,
           'source_date_basis', p.source_date_basis,
           'manual_date_settlement', jsonb_build_object(
             'requested_settlement_date', _settlement_date,
             'created_by', _created_by,
             'applied_at', now()
           ),
           'daily_settlement', jsonb_build_object(
             'settlement_date', _settlement_date,
             'release_date', NULL,
             'eligible', false,
             'block_reason', p.block_reason,
             'responsibility_points', p.responsibility_points,
             'responsibility_required_points', p.responsibility_required_points
           ),
           'settlement_date', _settlement_date,
           'release_date', NULL,
           'eligible_at_daily_settlement', false
         ),
         updated_at = now()
  FROM daily_bonus_for_date_pending p
  WHERE b.id = p.id
    AND p.eligible = false
    AND b.status = 'pending';

  GET DIAGNOSTICS _updated_blocked = ROW_COUNT;

  IF _eligible_count > 0 THEN
    INSERT INTO public.bonus_settlement_batches(
      settlement_type, settlement_period_start, settlement_period_end,
      total_members, total_bonus_points, status, created_by
    ) VALUES (
      'daily', _settlement_date, _settlement_date, _members, _total_points, 'processing', _created_by
    ) RETURNING id INTO _batch_id;

    UPDATE public.bonus_records b
      SET status = 'waiting_release',
          settlement_batch_id = _batch_id,
          settlement_date = _settlement_date,
          release_date = _release_date,
          required_points_checked = true,
          required_points_passed = true,
          fail_reason = NULL,
          calculation_detail = COALESCE(b.calculation_detail, '{}'::jsonb) || jsonb_build_object(
            'schema_version', CASE WHEN _use_v2 THEN 2 ELSE 1 END,
            'rule_version', CASE WHEN _use_v2 THEN 'v2_batch2' ELSE 'v1' END,
            'rule_id', 'daily_' || b.bonus_type || CASE WHEN _use_v2 THEN '_v2' ELSE '_v1' END,
            'settlement_source', 'settle_daily_bonus_for_date',
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
            'source_date', p.source_date,
            'source_date_basis', p.source_date_basis,
            'manual_date_settlement', jsonb_build_object(
              'requested_settlement_date', _settlement_date,
              'created_by', _created_by,
              'applied_at', now()
            ),
            'daily_settlement', jsonb_build_object(
              'settlement_batch_id', _batch_id,
              'settlement_date', _settlement_date,
              'release_date', _release_date,
              'eligible', true,
              'block_reason', NULL,
              'responsibility_points', p.responsibility_points,
              'responsibility_required_points', p.responsibility_required_points
            ),
            'settlement_batch_id', _batch_id,
            'settlement_date', _settlement_date,
            'release_date', _release_date,
            'eligible_at_daily_settlement', true
          ),
          updated_at = now()
    FROM daily_bonus_for_date_pending p
    WHERE b.id = p.id
      AND p.eligible = true
      AND b.status = 'pending';

    GET DIAGNOSTICS _updated_eligible = ROW_COUNT;

    UPDATE public.bonus_settlement_batches
      SET status = 'completed', completed_at = now(),
          total_members = _members,
          total_bonus_points = _total_points
    WHERE id = _batch_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'dry_run', false,
    'settlement_date', _settlement_date,
    'release_date', _release_date,
    'batch_id', _batch_id,
    'settled', _updated_eligible,
    'cancelled', _updated_blocked,
    'members', _members,
    'points', _total_points,
    'by_type', _by_type,
    'rule_version', CASE WHEN _use_v2 THEN 'v2_batch2' ELSE 'v1' END
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.settle_daily_bonus_for_date(date, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_daily_bonus_for_date(date, uuid, boolean) TO authenticated, service_role;

DO $$
DECLARE
  _fn text;
BEGIN
  SELECT pg_get_functiondef('public.settle_daily_bonus_for_date(date, uuid, boolean)'::regprocedure)
    INTO _fn;

  IF _fn IS NULL THEN
    RAISE EXCEPTION 'Verification failed: settle_daily_bonus_for_date was not created';
  END IF;

  IF position('b.bonus_type IN (''referral'',''repurchase'')' in _fn) = 0 THEN
    RAISE EXCEPTION 'Verification failed: daily whitelist is not referral/repurchase only';
  END IF;

  IF position('COALESCE((so.created_at AT TIME ZONE ''Asia/Taipei'')::date, (b.created_at AT TIME ZONE ''Asia/Taipei'')::date) = _settlement_date' in _fn) = 0 THEN
    RAISE EXCEPTION 'Verification failed: source-date filter is missing';
  END IF;

  IF position('member_points_wallet' in _fn) > 0
     OR position('reward_wallet_logs' in _fn) > 0
     OR position('point_transactions' in _fn) > 0 THEN
    RAISE EXCEPTION 'Verification failed: function body references wallet or point ledgers';
  END IF;
END;
$$;
