DO $$
DECLARE _r jsonb;
BEGIN
  SELECT public.recalculate_monthly_bonus('202607', null::uuid, true) INTO _r;
  RAISE NOTICE 'recalculate_monthly_bonus dry-run 202607 => %', _r::text;
END $$;