DO $$
DECLARE _sql text;
BEGIN
 SELECT pg_get_functiondef('private.list_pool_eligible_members(uuid,date)'::regprocedure) INTO _sql;
 IF position('SELECT EXISTS (' in _sql) = 0 THEN RAISE EXCEPTION 'Eligibility definition changed'; END IF;
 _sql := replace(_sql, E'SELECT EXISTS (\n    SELECT 1 FROM public.member_bonus_eligibility_grants g\n    WHERE NOT EXISTS (SELECT 1 FROM public.member_dividend_exclusions x WHERE x.user_id = g.user_id) AND g.pool_kind = _kind', E'SELECT EXISTS (\n    SELECT 1 FROM public.member_bonus_eligibility_grants g\n    WHERE g.pool_kind = _kind');
 EXECUTE _sql;
END $$;