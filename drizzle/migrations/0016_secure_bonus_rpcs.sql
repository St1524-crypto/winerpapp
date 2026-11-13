CREATE OR REPLACE FUNCTION public.get_member_total_earnings(_member_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF current_user IN ('anon','authenticated')
     AND auth.uid() IS DISTINCT FROM _member_id
     AND NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT COALESCE(SUM(COALESCE(br.base_amount,0)),0)
    FROM public.bonus_records br
    WHERE br.member_id = _member_id
      AND br.status IN ('released','paid','settled')
      AND br.bonus_type = ANY (public.get_upgrade_bonus_total_earnings_types()));
END $$;

CREATE OR REPLACE FUNCTION public.get_member_business_bonus_total(_member_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF current_user IN ('anon','authenticated')
     AND auth.uid() IS DISTINCT FROM _member_id
     AND NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT COALESCE(SUM(payable_amount),0)::numeric
    FROM public.vip_business_bonus_ledger
    WHERE member_id = _member_id AND status IN ('released','partial_capped'));
END $$;

CREATE OR REPLACE FUNCTION public.calc_vip_bonus_pool_daily(_pool_id uuid, _daily_total_reward_points numeric, _eligible_member_count integer)
RETURNS TABLE(pool_id uuid, bonus_rate numeric, pool_amount numeric, per_member_amount numeric, eligible_member_count integer, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
DECLARE _rate numeric; _pool numeric; _per numeric; _status text;
BEGIN
  IF current_user IN ('anon','authenticated')
     AND NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT vp.bonus_rate INTO _rate FROM public.vip_bonus_pools vp WHERE vp.id = _pool_id;
  IF _rate IS NULL THEN RAISE EXCEPTION 'pool not found'; END IF;
  _pool := COALESCE(_daily_total_reward_points,0) * _rate;
  IF COALESCE(_eligible_member_count,0) <= 0 THEN _per := 0; _status := 'no_eligible_members';
  ELSE _per := _pool / _eligible_member_count; _status := 'released'; END IF;
  RETURN QUERY SELECT _pool_id, _rate, _pool, _per, COALESCE(_eligible_member_count,0), _status;
END $function$;

REVOKE EXECUTE ON FUNCTION public.calc_vip_bonus_pool_daily(uuid,numeric,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_member_total_earnings(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_member_business_bonus_total(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calc_vip_bonus_pool_daily(uuid,numeric,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_member_total_earnings(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_member_business_bonus_total(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.distribute_daily_revenue_bonus(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_daily_revenue_bonus(date) TO service_role;