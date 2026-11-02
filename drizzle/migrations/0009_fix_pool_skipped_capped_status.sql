DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.distribute_vip_bonus_pool_daily(uuid,date,numeric)'::regprocedure);
BEGIN
  IF position('_status := ''capped'';' IN definition) = 0
     OR position('WHEN _status = ''capped'' THEN' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected pool function definition; capped status repair not applied';
  END IF;
  -- Use the existing payout CHECK vocabulary for both business and consumption pools.
  -- Preserve caps, amounts, eligibility, permissions and per-member idempotency.
  definition := replace(definition, '_status := ''capped'';', '_status := ''skipped_capped'';');
  definition := replace(definition, 'WHEN _status = ''capped'' THEN', 'WHEN _status = ''skipped_capped'' THEN');
  EXECUTE definition;
END;
$migration$;