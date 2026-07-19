-- Bonus recalculation audit + guarded dry-run/apply RPCs.
-- Safety:
-- - Does not write wallet / reward_wallet_logs / point_transactions.
-- - Daily apply delegates to settle_daily_bonus_for_date.
-- - Monthly apply is blocked when released rows exist.

CREATE TABLE IF NOT EXISTS public.bonus_recalculation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('daily', 'monthly')),
  target_date date,
  target_yyyymm text,
  dry_run boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'blocked')),
  requested_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bonus_recalculation_runs_daily_target
    CHECK ((scope <> 'daily') OR target_date IS NOT NULL),
  CONSTRAINT bonus_recalculation_runs_monthly_target
    CHECK ((scope <> 'monthly') OR target_yyyymm ~ '^[0-9]{6}$')
);

CREATE INDEX IF NOT EXISTS idx_bonus_recalculation_runs_scope_created
  ON public.bonus_recalculation_runs(scope, created_at DESC);

ALTER TABLE public.bonus_recalculation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bonus_recalculation_runs_admin_read ON public.bonus_recalculation_runs;
CREATE POLICY bonus_recalculation_runs_admin_read
  ON public.bonus_recalculation_runs
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin')
    OR private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'finance')
  );

DROP POLICY IF EXISTS bonus_recalculation_runs_admin_write ON public.bonus_recalculation_runs;
CREATE POLICY bonus_recalculation_runs_admin_write
  ON public.bonus_recalculation_runs
  FOR ALL TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin')
    OR private.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin')
    OR private.has_role(auth.uid(), 'admin')
  );

GRANT SELECT ON public.bonus_recalculation_runs TO authenticated;
GRANT ALL ON public.bonus_recalculation_runs TO service_role;

CREATE OR REPLACE FUNCTION private.assert_bonus_recalculation_role(_write boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RETURN;
  END IF;

  IF _write THEN
    IF NOT (
      private.has_role(_uid, 'super_admin')
      OR private.has_role(_uid, 'admin')
    ) THEN
      RAISE EXCEPTION '沒有權限執行獎金重算';
    END IF;
    RETURN;
  END IF;

  IF NOT (
    private.has_role(_uid, 'super_admin')
    OR private.has_role(_uid, 'admin')
    OR private.has_role(_uid, 'finance')
  ) THEN
    RAISE EXCEPTION '沒有權限查看獎金重算';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_bonus_recalculation_role(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.assert_bonus_recalculation_role(boolean) TO service_role;

CREATE OR REPLACE FUNCTION private.bonus_record_summary(
  _period_start date,
  _period_end date,
  _types text[]
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rows AS (
    SELECT status, bonus_type, COALESCE(bonus_points, 0)::numeric AS bonus_points
    FROM public.bonus_records
    WHERE settlement_date BETWEEN _period_start AND _period_end
      AND bonus_type = ANY(_types)
  ),
  by_status AS (
    SELECT status, count(*) AS count, COALESCE(sum(bonus_points), 0) AS points
    FROM rows
    GROUP BY status
  ),
  by_type AS (
    SELECT bonus_type, count(*) AS count, COALESCE(sum(bonus_points), 0) AS points
    FROM rows
    GROUP BY bonus_type
  )
  SELECT jsonb_build_object(
    'total_records', (SELECT count(*) FROM rows),
    'total_points', COALESCE((SELECT sum(bonus_points) FROM rows), 0),
    'released_records', COALESCE((SELECT sum(count) FROM by_status WHERE status = 'released'), 0),
    'released_points', COALESCE((SELECT sum(points) FROM by_status WHERE status = 'released'), 0),
    'by_status', COALESCE((SELECT jsonb_object_agg(status, jsonb_build_object('count', count, 'points', points)) FROM by_status), '{}'::jsonb),
    'by_type', COALESCE((SELECT jsonb_object_agg(bonus_type, jsonb_build_object('count', count, 'points', points)) FROM by_type), '{}'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION private.bonus_record_summary(date, date, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.bonus_record_summary(date, date, text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.recalculate_daily_bonus_for_date(
  _settlement_date date,
  _created_by uuid DEFAULT NULL::uuid,
  _dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run_id uuid;
  _before jsonb;
  _after jsonb;
  _rpc jsonb;
  _result jsonb;
BEGIN
  PERFORM private.assert_bonus_recalculation_role(NOT _dry_run);

  INSERT INTO public.bonus_recalculation_runs(scope, target_date, dry_run, requested_by)
  VALUES ('daily', _settlement_date, _dry_run, COALESCE(_created_by, auth.uid()))
  RETURNING id INTO _run_id;

  _before := private.bonus_record_summary(
    _settlement_date,
    _settlement_date,
    ARRAY['referral','repurchase','business_bonus']
  );

  IF NOT _dry_run AND COALESCE((_before->>'released_records')::int, 0) > 0 THEN
    _result := jsonb_build_object(
      'ok', false,
      'blocked', true,
      'reason', '此日期已有已發放獎金，請走追回或更正流程，不可覆蓋重算',
      'before', _before
    );
    UPDATE public.bonus_recalculation_runs
      SET status = 'blocked', finished_at = now(), result = _result, error = _result->>'reason'
      WHERE id = _run_id;
    RETURN _result || jsonb_build_object('run_id', _run_id);
  END IF;

  SELECT public.settle_daily_bonus_for_date(_settlement_date, COALESCE(_created_by, auth.uid()), _dry_run)
    INTO _rpc;

  _after := private.bonus_record_summary(
    _settlement_date,
    _settlement_date,
    ARRAY['referral','repurchase','business_bonus']
  );

  _result := jsonb_build_object(
    'ok', true,
    'scope', 'daily',
    'target_date', _settlement_date,
    'dry_run', _dry_run,
    'before', _before,
    'after', _after,
    'settlement_rpc', _rpc
  );

  UPDATE public.bonus_recalculation_runs
    SET status = 'completed', finished_at = now(), result = _result
    WHERE id = _run_id;

  RETURN _result || jsonb_build_object('run_id', _run_id);
EXCEPTION WHEN OTHERS THEN
  IF _run_id IS NOT NULL THEN
    UPDATE public.bonus_recalculation_runs
      SET status = 'failed', finished_at = now(), error = SQLERRM,
          result = jsonb_build_object('ok', false, 'error', SQLERRM)
      WHERE id = _run_id;
  END IF;
  RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalculate_daily_bonus_for_date(date, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_daily_bonus_for_date(date, uuid, boolean) TO authenticated, service_role;

-- Monthly recalculation cancels old non-released national_share rows before
-- regenerating the month. Idempotency therefore must ignore cancelled rows.
DROP INDEX IF EXISTS public.uniq_bonus_records_national_share;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bonus_records_national_share
  ON public.bonus_records (member_id, bonus_type, settlement_date)
  WHERE bonus_type = 'national_share'
    AND status <> 'cancelled';

DO $$
DECLARE
  _def text;
BEGIN
  SELECT pg_get_functiondef('public.settle_monthly_national_share(text, uuid, text, uuid, boolean)'::regprocedure)
    INTO _def;

  IF _def IS NULL THEN
    RAISE EXCEPTION 'public.settle_monthly_national_share(text, uuid, text, uuid, boolean) does not exist';
  END IF;

  IF _def NOT LIKE '%status <> ''cancelled''%' THEN
    _def := replace(
      _def,
      '          AND settlement_date = _period_end
          AND COALESCE((calculation_detail->>''tier_code''), '''') = _tier.tier_code',
      '          AND settlement_date = _period_end
          AND status <> ''cancelled''
          AND COALESCE((calculation_detail->>''tier_code''), '''') = _tier.tier_code'
    );
    EXECUTE _def;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.recalculate_monthly_bonus(
  _yyyymm text,
  _created_by uuid DEFAULT NULL::uuid,
  _dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run_id uuid;
  _year int;
  _month int;
  _period_start date;
  _period_end date;
  _before jsonb;
  _after jsonb;
  _national_preview jsonb := '{}'::jsonb;
  _released int := 0;
  _existing int := 0;
  _cancelled int := 0;
  _settlement jsonb := '{}'::jsonb;
  _result jsonb;
BEGIN
  IF _yyyymm !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION '月份格式錯誤，請使用 YYYYMM';
  END IF;

  PERFORM private.assert_bonus_recalculation_role(NOT _dry_run);

  _year := substring(_yyyymm from 1 for 4)::int;
  _month := substring(_yyyymm from 5 for 2)::int;
  _period_start := make_date(_year, _month, 1);
  _period_end := (_period_start + interval '1 month' - interval '1 day')::date;

  INSERT INTO public.bonus_recalculation_runs(scope, target_yyyymm, dry_run, requested_by)
  VALUES ('monthly', _yyyymm, _dry_run, COALESCE(_created_by, auth.uid()))
  RETURNING id INTO _run_id;

  _before := private.bonus_record_summary(
    _period_start,
    _period_end,
    ARRAY['monthly_vip','rank_rebate','rank_diff_rebate','national_share']
  );
  _released := COALESCE((_before->>'released_records')::int, 0);
  _existing := COALESCE((_before->>'total_records')::int, 0);

  SELECT public.settle_monthly_national_share(_yyyymm, COALESCE(_created_by, auth.uid()), 'monthly_recalculation_dry_run', NULL::uuid, true)
    INTO _national_preview;

  IF _dry_run THEN
    _result := jsonb_build_object(
      'ok', true,
      'scope', 'monthly',
      'target_yyyymm', _yyyymm,
      'dry_run', true,
      'period_start', _period_start,
      'period_end', _period_end,
      'before', _before,
      'national_share_preview', _national_preview,
      'apply_allowed', _released = 0,
      'apply_block_reason', CASE WHEN _released > 0 THEN '此月份已有已發放獎金，請走追回或更正流程' ELSE NULL END
    );
    UPDATE public.bonus_recalculation_runs
      SET status = 'completed', finished_at = now(), result = _result
      WHERE id = _run_id;
    RETURN _result || jsonb_build_object('run_id', _run_id);
  END IF;

  IF _released > 0 THEN
    _result := jsonb_build_object(
      'ok', false,
      'blocked', true,
      'reason', '此月份已有已發放獎金，請走追回或更正流程，不可覆蓋重算',
      'before', _before
    );
    UPDATE public.bonus_recalculation_runs
      SET status = 'blocked', finished_at = now(), result = _result, error = _result->>'reason'
      WHERE id = _run_id;
    RETURN _result || jsonb_build_object('run_id', _run_id);
  END IF;

  UPDATE public.bonus_records
    SET status = 'cancelled',
        fail_reason = concat_ws(E'\n', fail_reason, format('由獎金重算批次 %s 取消，將重新產生月結資料', _run_id)),
        calculation_detail = COALESCE(calculation_detail, '{}'::jsonb) || jsonb_build_object(
          'superseded_by_recalculation_run_id', _run_id,
          'superseded_at', now(),
          'superseded_reason', 'monthly_bonus_recalculation'
        ),
        updated_at = now()
    WHERE settlement_date BETWEEN _period_start AND _period_end
      AND bonus_type IN ('monthly_vip','rank_rebate','rank_diff_rebate','national_share')
      AND status <> 'released';
  GET DIAGNOSTICS _cancelled = ROW_COUNT;

  UPDATE public.bonus_settlement_batches b
    SET status = 'failed',
        completed_at = COALESCE(completed_at, now()),
        notes = concat_ws(E'\n', notes, format('由獎金重算批次 %s 取代；原批次改為 failed 以保留稽核軌跡。', _run_id))
    WHERE settlement_type = 'monthly'
      AND settlement_period_start = _period_start
      AND settlement_period_end = _period_end
      AND status IN ('running','processing','completed')
      AND NOT EXISTS (
        SELECT 1 FROM public.bonus_records br
        WHERE br.settlement_batch_id = b.id
          AND br.status = 'released'
      );

  SELECT public.settle_monthly_bonus(_yyyymm, COALESCE(_created_by, auth.uid()), 'monthly_recalculation')
    INTO _settlement;

  _after := private.bonus_record_summary(
    _period_start,
    _period_end,
    ARRAY['monthly_vip','rank_rebate','rank_diff_rebate','national_share']
  );

  _result := jsonb_build_object(
    'ok', true,
    'scope', 'monthly',
    'target_yyyymm', _yyyymm,
    'dry_run', false,
    'period_start', _period_start,
    'period_end', _period_end,
    'cancelled_old_records', _cancelled,
    'existing_before', _existing,
    'before', _before,
    'after', _after,
    'settlement_rpc', _settlement
  );

  UPDATE public.bonus_recalculation_runs
    SET status = 'completed', finished_at = now(), result = _result
    WHERE id = _run_id;

  RETURN _result || jsonb_build_object('run_id', _run_id);
EXCEPTION WHEN OTHERS THEN
  IF _run_id IS NOT NULL THEN
    UPDATE public.bonus_recalculation_runs
      SET status = 'failed', finished_at = now(), error = SQLERRM,
          result = jsonb_build_object('ok', false, 'error', SQLERRM)
      WHERE id = _run_id;
  END IF;
  RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalculate_monthly_bonus(text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_monthly_bonus(text, uuid, boolean) TO authenticated, service_role;

DO $$
DECLARE
  _daily text;
  _monthly text;
BEGIN
  SELECT pg_get_functiondef('public.recalculate_daily_bonus_for_date(date, uuid, boolean)'::regprocedure)
    INTO _daily;
  SELECT pg_get_functiondef('public.recalculate_monthly_bonus(text, uuid, boolean)'::regprocedure)
    INTO _monthly;

  IF _daily LIKE '%member_points_wallet%' OR _daily LIKE '%reward_wallet_logs%' OR _daily LIKE '%point_transactions%' THEN
    RAISE EXCEPTION 'Verification failed: daily recalculation RPC must not touch wallet or point ledgers';
  END IF;

  IF _monthly LIKE '%member_points_wallet%' OR _monthly LIKE '%reward_wallet_logs%' OR _monthly LIKE '%point_transactions%' THEN
    RAISE EXCEPTION 'Verification failed: monthly recalculation RPC must not touch wallet or point ledgers';
  END IF;

  IF _monthly NOT LIKE '%status = ''released''%' THEN
    RAISE EXCEPTION 'Verification failed: monthly recalculation must guard released rows';
  END IF;
END $$;