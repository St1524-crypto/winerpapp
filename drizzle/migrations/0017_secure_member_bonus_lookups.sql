CREATE OR REPLACE FUNCTION private.can_read_member(_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT session_user NOT IN ('anon','authenticated') AND current_user NOT IN ('anon','authenticated')
      OR auth.uid() = _member_id
      OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance')
$$;
REVOKE EXECUTE ON FUNCTION private.can_read_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_read_member(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_member_vip_tier_code(_member_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF current_user IN ('anon','authenticated') AND NOT private.can_read_member(_member_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT upper(COALESCE(p.legacy_rank, '')) FROM public.profiles p WHERE p.id = _member_id);
END $$;

CREATE OR REPLACE FUNCTION public.get_member_upgrade_bonus_total(_member_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF current_user IN ('anon','authenticated') AND NOT private.can_read_member(_member_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT COALESCE(SUM(payable_amount), 0)::numeric FROM public.vip_upgrade_bonus_ledger
    WHERE member_id = _member_id AND status IN ('released','partial_capped'));
END $$;

CREATE OR REPLACE FUNCTION public.get_member_upgrade_bonus_cap(_member_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF current_user IN ('anon','authenticated') AND NOT private.can_read_member(_member_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT COALESCE(vt.upgrade_bonus_cap_amount, vt.upgrade_bonus_cap, 0)::numeric FROM public.vip_tiers vt
    WHERE vt.code = public.get_member_vip_tier_code(_member_id) LIMIT 1);
END $$;

CREATE OR REPLACE FUNCTION public.get_member_business_bonus_cap(_member_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF current_user IN ('anon','authenticated') AND NOT private.can_read_member(_member_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT COALESCE(vt.business_bonus_cap_amount, 0)::numeric FROM public.vip_tiers vt
    WHERE vt.code = public.get_member_vip_tier_code(_member_id) LIMIT 1);
END $$;

CREATE OR REPLACE FUNCTION public.get_member_business_bonus_rate(_member_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF current_user IN ('anon','authenticated') AND NOT private.can_read_member(_member_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT COALESCE(vt.business_bonus_rate, 0)::numeric FROM public.vip_tiers vt
    WHERE vt.code = public.get_member_vip_tier_code(_member_id) LIMIT 1);
END $$;

CREATE OR REPLACE FUNCTION public.get_operation_role(_user_id uuid)
RETURNS operation_role LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF current_user IN ('anon','authenticated')
     AND auth.uid() IS DISTINCT FROM _user_id
     AND NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin')) THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT op_role FROM public.operation_participants
    WHERE user_id = _user_id AND is_active = true
    ORDER BY CASE op_role WHEN 'manager' THEN 1 WHEN 'staff' THEN 2 WHEN 'assistant' THEN 3 WHEN 'collaborator' THEN 4 END ASC
    LIMIT 1);
END $$;

CREATE OR REPLACE FUNCTION public.calc_business_bonus_release(_member_id uuid, _tier_code text, _bonus_amount numeric)
 RETURNS TABLE(bonus_amount numeric, payable_amount numeric, capped_amount numeric, total_before numeric, total_after numeric, cap_amount numeric, status text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _cap numeric; _before numeric; _remain numeric; _payable numeric; _capped numeric; _status text;
BEGIN
  IF current_user IN ('anon','authenticated') AND NOT private.can_read_member(_member_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _bonus_amount IS NULL OR _bonus_amount < 0 THEN _bonus_amount := 0; END IF;
  SELECT COALESCE(vt.business_bonus_cap_amount, 0) INTO _cap FROM public.vip_tiers vt WHERE vt.code = upper(_tier_code) LIMIT 1;
  _cap := COALESCE(_cap, 0);
  _before := public.get_member_business_bonus_total(_member_id);
  _remain := GREATEST(_cap - _before, 0);
  IF _cap = 0 THEN _payable := _bonus_amount; _capped := 0; _status := 'released';
  ELSIF _remain <= 0 THEN _payable := 0; _capped := _bonus_amount; _status := 'skipped_capped';
  ELSIF _bonus_amount <= _remain THEN _payable := _bonus_amount; _capped := 0; _status := 'released';
  ELSE _payable := _remain; _capped := _bonus_amount - _remain; _status := 'partial_capped';
  END IF;
  RETURN QUERY SELECT _bonus_amount, _payable, _capped, _before, _before + _payable, _cap, _status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.calc_upgrade_bonus_release(_member_id uuid, _tier_code text, _bonus_amount numeric)
 RETURNS TABLE(bonus_amount numeric, payable_amount numeric, capped_amount numeric, total_before numeric, total_after numeric, cap_amount numeric, status text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _cap numeric; _before numeric; _remain numeric; _payable numeric; _capped numeric; _status text;
BEGIN
  IF current_user IN ('anon','authenticated') AND NOT private.can_read_member(_member_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _bonus_amount IS NULL OR _bonus_amount < 0 THEN _bonus_amount := 0; END IF;
  SELECT COALESCE(vt.upgrade_bonus_cap_amount, vt.upgrade_bonus_cap, 0) INTO _cap FROM public.vip_tiers vt WHERE vt.code = upper(_tier_code) LIMIT 1;
  _cap := COALESCE(_cap, 0);
  _before := public.get_member_upgrade_bonus_total(_member_id);
  _remain := GREATEST(_cap - _before, 0);
  IF _cap = 0 THEN _payable := _bonus_amount; _capped := 0; _status := 'released';
  ELSIF _remain <= 0 THEN _payable := 0; _capped := _bonus_amount; _status := 'skipped_capped';
  ELSIF _bonus_amount <= _remain THEN _payable := _bonus_amount; _capped := 0; _status := 'released';
  ELSE _payable := _remain; _capped := _bonus_amount - _remain; _status := 'partial_capped';
  END IF;
  RETURN QUERY SELECT _bonus_amount, _payable, _capped, _before, _before + _payable, _cap, _status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.calc_upgrade_bonus_total_earnings_release(_member_id uuid, _tier_code text, _bonus_amount numeric)
 RETURNS TABLE(original_bonus_amount numeric, payable_amount numeric, capped_amount numeric, member_total_earnings_before numeric, member_total_earnings_after numeric, cap_amount numeric, cap_basis text, status text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_total numeric; v_cap numeric; v_remaining numeric; v_payable numeric; v_capped numeric; v_status text;
BEGIN
  IF current_user IN ('anon','authenticated') AND NOT private.can_read_member(_member_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_total := public.get_member_total_earnings(_member_id);
  v_cap := public.get_tier_upgrade_total_earnings_cap(_tier_code);
  IF v_cap <= 0 THEN
    RETURN QUERY SELECT _bonus_amount, _bonus_amount, 0::numeric, v_total, v_total + _bonus_amount, v_cap, 'total_earnings'::text, 'released'::text; RETURN;
  END IF;
  IF v_total >= v_cap THEN
    RETURN QUERY SELECT _bonus_amount, 0::numeric, _bonus_amount, v_total, v_total, v_cap, 'total_earnings'::text, 'skipped_capped'::text; RETURN;
  END IF;
  v_remaining := v_cap - v_total;
  IF _bonus_amount <= v_remaining THEN v_payable := _bonus_amount; v_capped := 0; v_status := 'released';
  ELSE v_payable := v_remaining; v_capped := _bonus_amount - v_remaining; v_status := 'partial_capped'; END IF;
  RETURN QUERY SELECT _bonus_amount, v_payable, v_capped, v_total, v_total + v_payable, v_cap, 'total_earnings'::text, v_status;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_member_vip_tier_code(uuid), public.get_member_upgrade_bonus_total(uuid), public.get_member_upgrade_bonus_cap(uuid), public.get_member_business_bonus_cap(uuid), public.get_member_business_bonus_rate(uuid), public.calc_business_bonus_release(uuid,text,numeric), public.calc_upgrade_bonus_release(uuid,text,numeric), public.calc_upgrade_bonus_total_earnings_release(uuid,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_vip_tier_code(uuid), public.get_member_upgrade_bonus_total(uuid), public.get_member_upgrade_bonus_cap(uuid), public.get_member_business_bonus_cap(uuid), public.get_member_business_bonus_rate(uuid), public.calc_business_bonus_release(uuid,text,numeric), public.calc_upgrade_bonus_release(uuid,text,numeric), public.calc_upgrade_bonus_total_earnings_release(uuid,text,numeric) TO authenticated, service_role;