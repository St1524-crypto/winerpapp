CREATE OR REPLACE FUNCTION public.recalculate_daily_bonus_for_date(
  _settlement_date date,
  _created_by uuid DEFAULT NULL::uuid,
  _dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _run_id uuid;
  _before jsonb;
  _after jsonb;
  _rpc jsonb;
  _result jsonb;
  _orphan_ids uuid[];
  _orphan_points bigint := 0;
  _orphan_count int := 0;
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

  SELECT COALESCE(array_agg(br.id), '{}'::uuid[]),
         COALESCE(SUM(br.bonus_points), 0),
         COUNT(*)
    INTO _orphan_ids, _orphan_points, _orphan_count
  FROM public.bonus_records br
  WHERE br.settlement_date = _settlement_date
    AND br.status = 'waiting_release'
    AND br.source_order_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.sales_orders so WHERE so.id = br.source_order_id
    );

  IF NOT _dry_run AND _orphan_count > 0 THEN
    UPDATE public.bonus_records
       SET status = 'cancelled',
           updated_at = now(),
           fail_reason = COALESCE(fail_reason, '') ||
                         CASE WHEN COALESCE(fail_reason,'')='' THEN '' ELSE ' | ' END ||
                         '[recalc auto-cancel] source order deleted at ' || now()::text
     WHERE id = ANY(_orphan_ids);
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
    'settlement_rpc', _rpc,
    'orphan_cancelled', jsonb_build_object(
      'count', _orphan_count,
      'points', _orphan_points,
      'ids', to_jsonb(_orphan_ids),
      'applied', (NOT _dry_run)
    )
  );

  UPDATE public.bonus_recalculation_runs
    SET status = 'completed', finished_at = now(), result = _result
    WHERE id = _run_id;

  RETURN _result || jsonb_build_object('run_id', _run_id);
END;
$function$;