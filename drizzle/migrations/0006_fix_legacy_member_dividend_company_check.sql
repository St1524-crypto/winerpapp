CREATE OR REPLACE FUNCTION public.set_member_dividend_exclusion(_user_id uuid, _excluded boolean, _reason text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _company uuid := private.current_company_id(); _old jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION '只有超級管理員可設定不參與分紅'; END IF;
 IF _company IS NULL OR NOT (
 EXISTS (SELECT 1 FROM public.company_members WHERE user_id = _user_id AND company_id = _company)
 OR (NOT EXISTS (SELECT 1 FROM public.company_members WHERE user_id = _user_id)
 AND EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND current_company_id = _company))
 ) THEN RAISE EXCEPTION '會員不屬於目前公司，請切換至會員所屬公司後再設定分紅'; END IF;
 IF _excluded AND (length(trim(COALESCE(_reason,''))) = 0 OR length(_reason) > 200) THEN RAISE EXCEPTION '請填寫停止分紅原因（最多200字）'; END IF;
 SELECT to_jsonb(x) INTO _old FROM public.member_dividend_exclusions x WHERE user_id = _user_id FOR UPDATE;
 IF _old IS NOT NULL AND (_old->>'company_id')::uuid <> _company THEN RAISE EXCEPTION '既有分紅設定屬於其他公司，請切換公司後再修改'; END IF;
 IF _excluded THEN
 INSERT INTO public.member_dividend_exclusions(user_id, company_id, reason, updated_by) VALUES (_user_id, _company, trim(_reason), auth.uid()) ON CONFLICT(user_id) DO UPDATE SET company_id = EXCLUDED.company_id, reason = EXCLUDED.reason, updated_by = EXCLUDED.updated_by, updated_at = now();
 ELSE
 DELETE FROM public.member_dividend_exclusions WHERE user_id = _user_id AND company_id = _company;
 END IF;
 INSERT INTO public.audit_logs(user_id, entity, entity_id, action, metadata) VALUES(auth.uid(), 'member_dividend_exclusions', _user_id, 'set_dividend_exclusion', jsonb_build_object('excluded',_excluded,'reason',_reason,'before',_old,'company_id',_company));
END $$;
REVOKE ALL ON FUNCTION public.set_member_dividend_exclusion(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_dividend_exclusion(uuid,boolean,text) TO authenticated;