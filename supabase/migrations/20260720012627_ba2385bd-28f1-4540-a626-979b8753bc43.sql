DO $$
DECLARE
  _oid oid;
  _fn text;
  _src text;
  _new text;
BEGIN
  FOR _oid, _fn IN
    SELECT p.oid, n.nspname||'.'||p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('public','distribute_daily_revenue_bonus'),
      ('public','distribute_national_bonus_v2'),
      ('private','list_pool_eligible_members')
    )
  LOOP
    _src := pg_get_functiondef(_oid);
    _new := regexp_replace(_src, '\ms\.member_id\M', 's.user_id', 'g');
    IF _new <> _src THEN
      EXECUTE _new;
      RAISE NOTICE 'Patched %', _fn;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE _bad int;
BEGIN
  SELECT count(*) INTO _bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','private') AND p.prokind='f'
    AND pg_get_functiondef(p.oid) ~* 'dealer_tier_status'
    AND pg_get_functiondef(p.oid) ~ '\ms\.member_id\M';
  IF _bad > 0 THEN
    RAISE EXCEPTION 'Still % functions referencing s.member_id on dealer_tier_status', _bad;
  END IF;
END $$;