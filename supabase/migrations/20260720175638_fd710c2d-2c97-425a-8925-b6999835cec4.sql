DO $$
DECLARE
  fn text;
  old_fragment text := 'WHERE ev.vip_tier_code IN (''STAR1'',''STAR2'',''STAR3'',''STAR4'',''STAR5'',''STAR6'',''STAR7'',''DIRECTOR'',''E'',''A'');';
  new_fragment text := 'WHERE ev.vip_tier_code IN (''STAR1'',''STAR2'',''STAR3'',''STAR4'',''STAR5'',''STAR6'',''STAR7'',''DIRECTOR'');';
BEGIN
  SELECT pg_get_functiondef('public.distribute_daily_revenue_bonus(date)'::regprocedure) INTO fn;

  IF fn IS NULL THEN
    RAISE EXCEPTION 'public.distribute_daily_revenue_bonus(date) not found';
  END IF;

  IF position(old_fragment in fn) = 0 THEN
    RAISE EXCEPTION 'Expected E/A eligibility fragment not found in distribute_daily_revenue_bonus';
  END IF;

  fn := replace(fn, old_fragment, new_fragment);
  EXECUTE fn;
END $$;