CREATE TABLE public.member_dividend_exclusions (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 company_id uuid NOT NULL REFERENCES public.companies(id),
 reason text NOT NULL,
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.member_dividend_exclusions TO authenticated;
GRANT ALL ON public.member_dividend_exclusions TO service_role;
ALTER TABLE public.member_dividend_exclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY dividend_exclusions_read ON public.member_dividend_exclusions FOR SELECT TO authenticated USING (user_id = auth.uid() OR (company_id = private.current_company_id() AND (private.has_role(auth.uid(), 'super_admin') OR private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'finance'))));
CREATE FUNCTION public.set_member_dividend_exclusion(_user_id uuid, _excluded boolean, _reason text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _company uuid := private.current_company_id(); _old jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION '只有超級管理員可設定不參與分紅'; END IF;
 IF _company IS NULL OR NOT EXISTS (SELECT 1 FROM public.company_members WHERE user_id = _user_id AND company_id = _company) THEN RAISE EXCEPTION '會員不屬於目前公司'; END IF;
 IF _excluded AND (length(trim(COALESCE(_reason,''))) = 0 OR length(_reason) > 200) THEN RAISE EXCEPTION '請填寫停止分紅原因（最多200字）'; END IF;
 SELECT to_jsonb(x) INTO _old FROM public.member_dividend_exclusions x WHERE user_id = _user_id FOR UPDATE;
 IF _excluded THEN
 INSERT INTO public.member_dividend_exclusions(user_id, company_id, reason, updated_by) VALUES (_user_id, _company, trim(_reason), auth.uid()) ON CONFLICT(user_id) DO UPDATE SET company_id = EXCLUDED.company_id, reason = EXCLUDED.reason, updated_by = EXCLUDED.updated_by, updated_at = now();
 ELSE
 DELETE FROM public.member_dividend_exclusions WHERE user_id = _user_id;
 END IF;
 INSERT INTO public.audit_logs(user_id, entity, entity_id, action, metadata) VALUES(auth.uid(), 'member_dividend_exclusions', _user_id, 'set_dividend_exclusion', jsonb_build_object('excluded',_excluded,'reason',_reason,'before',_old));
END $$;
REVOKE ALL ON FUNCTION public.set_member_dividend_exclusion(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_dividend_exclusion(uuid,boolean,text) TO authenticated;
DO $$
DECLARE _sql text;
BEGIN
 SELECT pg_get_functiondef('private.list_pool_eligible_members(uuid,date)'::regprocedure) INTO _sql;
 IF position('WHERE g.pool_kind = _kind' in _sql) = 0 OR position('WHERE ev.vip_tier_code IS NOT NULL' in _sql) = 0 THEN RAISE EXCEPTION 'Eligibility definition changed'; END IF;
 _sql := replace(_sql,'WHERE g.pool_kind = _kind','WHERE NOT EXISTS (SELECT 1 FROM public.member_dividend_exclusions x WHERE x.user_id = g.user_id) AND g.pool_kind = _kind');
 _sql := replace(_sql,'WHERE ev.vip_tier_code IS NOT NULL','WHERE NOT EXISTS (SELECT 1 FROM public.member_dividend_exclusions x WHERE x.user_id = s.user_id) AND ev.vip_tier_code IS NOT NULL');
 EXECUTE _sql;
 SELECT pg_get_functiondef('public.distribute_daily_revenue_bonus(date)'::regprocedure) INTO _sql;
 IF position('WHERE ev.vip_tier_code IN' in _sql) = 0 THEN RAISE EXCEPTION 'Business definition changed'; END IF;
 EXECUTE replace(_sql,'WHERE ev.vip_tier_code IN','WHERE NOT EXISTS (SELECT 1 FROM public.member_dividend_exclusions x WHERE x.user_id = s.user_id) AND ev.vip_tier_code IN');
 SELECT pg_get_functiondef('public.distribute_national_bonus_v2(date,numeric)'::regprocedure) INTO _sql;
 IF position('WHERE ev.vip_tier_code = _tier.tier_code' in _sql) = 0 THEN RAISE EXCEPTION 'National daily definition changed'; END IF;
 EXECUTE replace(_sql,'WHERE ev.vip_tier_code = _tier.tier_code','WHERE NOT EXISTS (SELECT 1 FROM public.member_dividend_exclusions x WHERE x.user_id = s.user_id) AND ev.vip_tier_code = _tier.tier_code');
 SELECT pg_get_functiondef('public.settle_monthly_national_share(text,uuid,text,uuid,boolean)'::regprocedure) INTO _sql;
 IF position('WHERE ev.vip_tier_code = _tier.tier_code' in _sql) = 0 THEN RAISE EXCEPTION 'National monthly definition changed'; END IF;
 EXECUTE replace(_sql,'WHERE ev.vip_tier_code = _tier.tier_code','WHERE NOT EXISTS (SELECT 1 FROM public.member_dividend_exclusions x WHERE x.user_id = s.user_id) AND ev.vip_tier_code = _tier.tier_code');
 SELECT pg_get_functiondef('public.release_bonus_rewards(uuid[],integer)'::regprocedure) INTO _sql;
 IF position('v_resolution := public.resolve_bonus_reward_recipient' in _sql) = 0 OR position('v_base := GREATEST' in _sql) = 0 THEN RAISE EXCEPTION 'Release definition changed'; END IF;
 _sql := replace(_sql,'v_resolution := public.resolve_bonus_reward_recipient', E'IF v_record.bonus_type = ''national_share'' AND EXISTS (SELECT 1 FROM public.member_dividend_exclusions x WHERE x.user_id = v_record.member_id) THEN\n UPDATE public.bonus_records SET status = ''failed'', fail_reason = ''超級管理員設定不參與分紅'', failed_at = now(), updated_at = now() WHERE id = v_record.id;\n v_failed := v_failed + 1; CONTINUE;\n END IF;\n v_resolution := public.resolve_bonus_reward_recipient');
 _sql := replace(_sql,'v_base := GREATEST', E'IF v_record.bonus_type = ''national_share'' AND EXISTS (SELECT 1 FROM public.member_dividend_exclusions x WHERE x.user_id = v_recipient) THEN\n UPDATE public.bonus_records SET status = ''failed'', fail_reason = ''超級管理員設定不參與分紅'', failed_at = now(), updated_at = now() WHERE id = v_record.id;\n v_failed := v_failed + 1; CONTINUE;\n END IF;\n v_base := GREATEST');
 EXECUTE _sql;
END $$;