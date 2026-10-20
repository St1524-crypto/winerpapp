-- Run as postgres with psql -X -v ON_ERROR_STOP=1 -f src/lib/dividend-exclusion-audit.test.sql.
-- All member and audit changes are rolled back, including on assertion failure.
BEGIN;
DO $$
DECLARE
  actor uuid;
  target uuid;
  company uuid;
  before_logs bigint;
  after_logs bigint;
  rejected boolean := false;
BEGIN
  SELECT p.id, p.current_company_id INTO actor, company
  FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id
  WHERE r.role = 'super_admin' AND p.current_company_id IS NOT NULL
  ORDER BY p.id LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'Test requires a super administrator with an assigned company'; END IF;

  SELECT p.id INTO target FROM public.profiles p
  WHERE p.id <> actor
    AND NOT EXISTS (SELECT 1 FROM public.member_dividend_exclusions e WHERE e.user_id = p.id)
    AND (EXISTS (SELECT 1 FROM public.company_members m WHERE m.user_id = p.id AND m.company_id = company)
      OR (p.current_company_id = company AND NOT EXISTS (SELECT 1 FROM public.company_members m WHERE m.user_id = p.id)))
  ORDER BY p.id LIMIT 1;
  IF target IS NULL THEN RAISE EXCEPTION 'Test requires a same-company member without an exclusion'; END IF;
  SELECT count(*) INTO before_logs FROM public.audit_logs
    WHERE entity_id = target AND action = 'set_dividend_exclusion';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',actor,'role','authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO public.audit_logs(user_id,entity,entity_id,action,metadata)
      VALUES(actor,'member_dividend_exclusions',target,'set_dividend_exclusion','{}');
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Direct untrusted audit insert must be denied, even with super administrator claims'; END IF;
  RAISE NOTICE 'PASS: direct untrusted audit insert denied';

  PERFORM public.set_member_dividend_exclusion(target,true,'Transactional audit regression test');
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.member_dividend_exclusions
    WHERE user_id = target AND company_id = company AND updated_by = actor
      AND reason = 'Transactional audit regression test') THEN
    RAISE EXCEPTION 'Authorized exclusion was not persisted';
  END IF;
  SELECT count(*) INTO after_logs FROM public.audit_logs
    WHERE entity_id = target AND action = 'set_dividend_exclusion' AND user_id = actor;
  IF after_logs <> before_logs + 1 THEN RAISE EXCEPTION 'Exclusion must save exactly one audit row'; END IF;
  RAISE NOTICE 'PASS: exclusion and audit saved atomically';

  SET LOCAL ROLE authenticated;
  PERFORM public.set_member_dividend_exclusion(target,false,'');
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.member_dividend_exclusions WHERE user_id = target) THEN
    RAISE EXCEPTION 'Authorized exclusion removal failed';
  END IF;
  SELECT count(*) INTO after_logs FROM public.audit_logs
    WHERE entity_id = target AND action = 'set_dividend_exclusion' AND user_id = actor;
  IF after_logs <> before_logs + 2 THEN RAISE EXCEPTION 'Removal must save exactly one audit row'; END IF;
  RAISE NOTICE 'PASS: exclusion removal and audit saved atomically';
END;
$$;
ROLLBACK;