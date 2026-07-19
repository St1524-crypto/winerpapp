-- ─────────────────────────────────────────────────────────────
-- 1. 擴充 bonus_records 允許狀態與型別
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.bonus_records
  DROP CONSTRAINT IF EXISTS bonus_records_status_check;
ALTER TABLE public.bonus_records
  ADD CONSTRAINT bonus_records_status_check
  CHECK (status IN ('pending','settled','waiting_release','released','cancelled','failed','clawback'));

ALTER TABLE public.bonus_records
  DROP CONSTRAINT IF EXISTS bonus_records_bonus_type_check;
ALTER TABLE public.bonus_records
  ADD CONSTRAINT bonus_records_bonus_type_check
  CHECK (bonus_type IN ('referral','repurchase','monthly_vip','rank_rebate','rank_diff_rebate','national_share','business_bonus'));

-- ─────────────────────────────────────────────────────────────
-- 2. bonus_recalculation_runs 新增 mode / clawback_batch_id
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.bonus_recalculation_runs
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'preview';
ALTER TABLE public.bonus_recalculation_runs
  ADD COLUMN IF NOT EXISTS clawback_batch_id uuid REFERENCES public.bonus_settlement_batches(id) ON DELETE SET NULL;

ALTER TABLE public.bonus_recalculation_runs
  DROP CONSTRAINT IF EXISTS bonus_recalculation_runs_mode_check;
ALTER TABLE public.bonus_recalculation_runs
  ADD CONSTRAINT bonus_recalculation_runs_mode_check
  CHECK (mode IN ('preview','clawback','correction'));

-- ─────────────────────────────────────────────────────────────
-- 3. Daily：追回／更正 wrapper RPC
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalculate_daily_bonus_with_mode(
  _settlement_date date,
  _mode text DEFAULT 'preview',
  _created_by uuid DEFAULT NULL,
  _dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _run_id uuid;
  _batch_id uuid;
  _released_rows jsonb;
  _released_count int := 0;
  _released_points int := 0;
  _distinct_members int := 0;
  _inserted int := 0;
  _existing_clawback int := 0;
  _base_result jsonb;
  _result jsonb;
  _types text[] := ARRAY['referral','repurchase','business_bonus'];
BEGIN
  IF _mode NOT IN ('preview','clawback','correction') THEN
    RAISE EXCEPTION '未知的模式：%（僅接受 preview / clawback / correction）', _mode;
  END IF;

  -- preview / correction 直接沿用既有 RPC
  IF _mode IN ('preview','correction') THEN
    _base_result := public.recalculate_daily_bonus_for_date(_settlement_date, _created_by, _dry_run);
    RETURN _base_result || jsonb_build_object('mode', _mode);
  END IF;

  -- ---------- clawback ----------
  PERFORM private.assert_bonus_recalculation_role(NOT _dry_run);

  INSERT INTO public.bonus_recalculation_runs(scope, target_date, dry_run, requested_by, mode)
  VALUES ('daily', _settlement_date, _dry_run, COALESCE(_created_by, auth.uid()), 'clawback')
  RETURNING id INTO _run_id;

  -- 聚合已發放獎金（尚未被沖銷者）
  SELECT
    COUNT(*)::int,
    COALESCE(SUM(br.bonus_points),0)::int,
    COUNT(DISTINCT br.member_id)::int,
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', br.id,
        'member_id', br.member_id,
        'bonus_type', br.bonus_type,
        'bonus_points', br.bonus_points,
        'settlement_batch_id', br.settlement_batch_id
      ) ORDER BY br.member_id
    ) FILTER (WHERE br.id IS NOT NULL), '[]'::jsonb)
  INTO _released_count, _released_points, _distinct_members, _released_rows
  FROM public.bonus_records br
  WHERE br.settlement_date = _settlement_date
    AND br.bonus_type = ANY(_types)
    AND br.status = 'released'
    AND NOT EXISTS (
      SELECT 1 FROM public.bonus_records c
      WHERE c.status = 'clawback'
        AND (c.calculation_detail->>'clawback_of')::uuid = br.id
    );

  IF _dry_run THEN
    _result := jsonb_build_object(
      'ok', true,
      'mode', 'clawback',
      'scope', 'daily',
      'target_date', _settlement_date,
      'dry_run', true,
      'would_clawback_records', _released_count,
      'would_clawback_points', -_released_points,
      'distinct_members', _distinct_members,
      'records', _released_rows
    );
    UPDATE public.bonus_recalculation_runs
      SET status='completed', finished_at=now(), result=_result
      WHERE id=_run_id;
    RETURN _result || jsonb_build_object('run_id', _run_id);
  END IF;

  IF _released_count = 0 THEN
    _result := jsonb_build_object(
      'ok', true, 'mode','clawback', 'scope','daily', 'target_date', _settlement_date,
      'dry_run', false, 'clawback_records', 0, 'clawback_points', 0,
      'message', '此日期無需追回的已發放獎金'
    );
    UPDATE public.bonus_recalculation_runs
      SET status='completed', finished_at=now(), result=_result
      WHERE id=_run_id;
    RETURN _result || jsonb_build_object('run_id', _run_id);
  END IF;

  INSERT INTO public.bonus_settlement_batches(
    settlement_type, settlement_period_start, settlement_period_end,
    total_members, total_bonus_points, status, notes, created_by, completed_at, source
  ) VALUES (
    'daily', _settlement_date, _settlement_date,
    _distinct_members, -_released_points, 'completed',
    format('clawback via recalculation run %s', _run_id),
    COALESCE(_created_by, auth.uid()), now(), 'clawback_recalculation'
  ) RETURNING id INTO _batch_id;

  WITH src AS (
    SELECT br.* FROM public.bonus_records br
    WHERE br.settlement_date = _settlement_date
      AND br.bonus_type = ANY(_types)
      AND br.status = 'released'
      AND NOT EXISTS (
        SELECT 1 FROM public.bonus_records c
        WHERE c.status = 'clawback'
          AND (c.calculation_detail->>'clawback_of')::uuid = br.id
      )
  )
  INSERT INTO public.bonus_records(
    member_id, source_member_id, source_order_id, bonus_type, generation_level,
    base_amount, bonus_rate, bonus_points,
    required_points_checked, required_points_passed,
    status, settlement_batch_id, settlement_date, layer_level,
    calculation_detail
  )
  SELECT
    src.member_id, src.source_member_id, src.source_order_id, src.bonus_type, src.generation_level,
    -src.base_amount, src.bonus_rate, -src.bonus_points,
    true, true,
    'clawback', _batch_id, _settlement_date, src.layer_level,
    jsonb_build_object(
      'mode','clawback',
      'clawback_of', src.id,
      'clawback_of_batch_id', src.settlement_batch_id,
      'recalculation_run_id', _run_id,
      'original_bonus_points', src.bonus_points,
      'original_release_date', src.release_date
    )
  FROM src;
  GET DIAGNOSTICS _inserted = ROW_COUNT;

  _result := jsonb_build_object(
    'ok', true,
    'mode', 'clawback',
    'scope', 'daily',
    'target_date', _settlement_date,
    'dry_run', false,
    'clawback_batch_id', _batch_id,
    'clawback_records', _inserted,
    'clawback_points', -_released_points,
    'distinct_members', _distinct_members
  );

  UPDATE public.bonus_recalculation_runs
    SET status='completed', finished_at=now(), result=_result, clawback_batch_id=_batch_id
    WHERE id=_run_id;

  RETURN _result || jsonb_build_object('run_id', _run_id);
EXCEPTION WHEN OTHERS THEN
  IF _run_id IS NOT NULL THEN
    UPDATE public.bonus_recalculation_runs
      SET status='failed', finished_at=now(), error=SQLERRM,
          result=jsonb_build_object('ok', false, 'error', SQLERRM)
      WHERE id=_run_id;
  END IF;
  RAISE;
END;
$function$;

-- ─────────────────────────────────────────────────────────────
-- 4. Monthly：追回／更正 wrapper RPC
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalculate_monthly_bonus_with_mode(
  _yyyymm text,
  _mode text DEFAULT 'preview',
  _created_by uuid DEFAULT NULL,
  _dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _run_id uuid;
  _batch_id uuid;
  _year int;
  _month int;
  _period_start date;
  _period_end date;
  _released_count int := 0;
  _released_points int := 0;
  _distinct_members int := 0;
  _released_rows jsonb;
  _inserted int := 0;
  _base_result jsonb;
  _result jsonb;
  _types text[] := ARRAY['monthly_vip','rank_rebate','rank_diff_rebate','national_share'];
BEGIN
  IF _mode NOT IN ('preview','clawback','correction') THEN
    RAISE EXCEPTION '未知的模式：%（僅接受 preview / clawback / correction）', _mode;
  END IF;

  IF _yyyymm !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION '月份格式錯誤，請使用 YYYYMM';
  END IF;

  IF _mode IN ('preview','correction') THEN
    _base_result := public.recalculate_monthly_bonus(_yyyymm, _created_by, _dry_run);
    RETURN _base_result || jsonb_build_object('mode', _mode);
  END IF;

  -- ---------- clawback ----------
  PERFORM private.assert_bonus_recalculation_role(NOT _dry_run);

  _year := substring(_yyyymm from 1 for 4)::int;
  _month := substring(_yyyymm from 5 for 2)::int;
  _period_start := make_date(_year, _month, 1);
  _period_end := (_period_start + interval '1 month' - interval '1 day')::date;

  INSERT INTO public.bonus_recalculation_runs(scope, target_yyyymm, dry_run, requested_by, mode)
  VALUES ('monthly', _yyyymm, _dry_run, COALESCE(_created_by, auth.uid()), 'clawback')
  RETURNING id INTO _run_id;

  SELECT
    COUNT(*)::int,
    COALESCE(SUM(br.bonus_points),0)::int,
    COUNT(DISTINCT br.member_id)::int,
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', br.id,
        'member_id', br.member_id,
        'bonus_type', br.bonus_type,
        'bonus_points', br.bonus_points,
        'settlement_date', br.settlement_date,
        'settlement_batch_id', br.settlement_batch_id
      ) ORDER BY br.member_id
    ) FILTER (WHERE br.id IS NOT NULL), '[]'::jsonb)
  INTO _released_count, _released_points, _distinct_members, _released_rows
  FROM public.bonus_records br
  WHERE br.settlement_date BETWEEN _period_start AND _period_end
    AND br.bonus_type = ANY(_types)
    AND br.status = 'released'
    AND NOT EXISTS (
      SELECT 1 FROM public.bonus_records c
      WHERE c.status = 'clawback'
        AND (c.calculation_detail->>'clawback_of')::uuid = br.id
    );

  IF _dry_run THEN
    _result := jsonb_build_object(
      'ok', true, 'mode','clawback', 'scope','monthly', 'target_yyyymm', _yyyymm,
      'period_start', _period_start, 'period_end', _period_end,
      'dry_run', true,
      'would_clawback_records', _released_count,
      'would_clawback_points', -_released_points,
      'distinct_members', _distinct_members,
      'records', _released_rows
    );
    UPDATE public.bonus_recalculation_runs
      SET status='completed', finished_at=now(), result=_result WHERE id=_run_id;
    RETURN _result || jsonb_build_object('run_id', _run_id);
  END IF;

  IF _released_count = 0 THEN
    _result := jsonb_build_object(
      'ok', true, 'mode','clawback', 'scope','monthly', 'target_yyyymm', _yyyymm,
      'dry_run', false, 'clawback_records', 0, 'clawback_points', 0,
      'message', '此月份無需追回的已發放獎金'
    );
    UPDATE public.bonus_recalculation_runs
      SET status='completed', finished_at=now(), result=_result WHERE id=_run_id;
    RETURN _result || jsonb_build_object('run_id', _run_id);
  END IF;

  INSERT INTO public.bonus_settlement_batches(
    settlement_type, settlement_period_start, settlement_period_end,
    total_members, total_bonus_points, status, notes, created_by, completed_at, source
  ) VALUES (
    'monthly', _period_start, _period_end,
    _distinct_members, -_released_points, 'completed',
    format('clawback via recalculation run %s', _run_id),
    COALESCE(_created_by, auth.uid()), now(), 'clawback_recalculation'
  ) RETURNING id INTO _batch_id;

  WITH src AS (
    SELECT br.* FROM public.bonus_records br
    WHERE br.settlement_date BETWEEN _period_start AND _period_end
      AND br.bonus_type = ANY(_types)
      AND br.status = 'released'
      AND NOT EXISTS (
        SELECT 1 FROM public.bonus_records c
        WHERE c.status = 'clawback'
          AND (c.calculation_detail->>'clawback_of')::uuid = br.id
      )
  )
  INSERT INTO public.bonus_records(
    member_id, source_member_id, source_order_id, bonus_type, generation_level,
    base_amount, bonus_rate, bonus_points,
    required_points_checked, required_points_passed,
    status, settlement_batch_id, settlement_date, layer_level,
    calculation_detail
  )
  SELECT
    src.member_id, src.source_member_id, src.source_order_id, src.bonus_type, src.generation_level,
    -src.base_amount, src.bonus_rate, -src.bonus_points,
    true, true,
    'clawback', _batch_id, src.settlement_date, src.layer_level,
    jsonb_build_object(
      'mode','clawback',
      'clawback_of', src.id,
      'clawback_of_batch_id', src.settlement_batch_id,
      'recalculation_run_id', _run_id,
      'original_bonus_points', src.bonus_points,
      'original_release_date', src.release_date
    )
  FROM src;
  GET DIAGNOSTICS _inserted = ROW_COUNT;

  _result := jsonb_build_object(
    'ok', true, 'mode','clawback', 'scope','monthly', 'target_yyyymm', _yyyymm,
    'period_start', _period_start, 'period_end', _period_end,
    'dry_run', false,
    'clawback_batch_id', _batch_id,
    'clawback_records', _inserted,
    'clawback_points', -_released_points,
    'distinct_members', _distinct_members
  );

  UPDATE public.bonus_recalculation_runs
    SET status='completed', finished_at=now(), result=_result, clawback_batch_id=_batch_id
    WHERE id=_run_id;

  RETURN _result || jsonb_build_object('run_id', _run_id);
EXCEPTION WHEN OTHERS THEN
  IF _run_id IS NOT NULL THEN
    UPDATE public.bonus_recalculation_runs
      SET status='failed', finished_at=now(), error=SQLERRM,
          result=jsonb_build_object('ok', false, 'error', SQLERRM)
      WHERE id=_run_id;
  END IF;
  RAISE;
END;
$function$;

-- ─────────────────────────────────────────────────────────────
-- 5. 權限：REVOKE PUBLIC/anon，GRANT authenticated / service_role
-- ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.recalculate_daily_bonus_with_mode(date, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_daily_bonus_with_mode(date, text, uuid, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.recalculate_monthly_bonus_with_mode(text, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_monthly_bonus_with_mode(text, text, uuid, boolean) TO authenticated, service_role;