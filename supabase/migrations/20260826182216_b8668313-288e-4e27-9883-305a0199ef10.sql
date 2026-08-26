CREATE OR REPLACE FUNCTION private.list_pool_eligible_members(_pool_id uuid, _on date DEFAULT NULL::date)
 RETURNS TABLE(member_id uuid, legacy_code text, mapped_code text, pool_ordinal text, tier_mapping_source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _codes text[];
  _status text;
  _code text;
  _kind text;
  _exclusive boolean;
BEGIN
  SELECT tier_codes, status, code INTO _codes, _status, _code
  FROM public.vip_bonus_pools WHERE id = _pool_id;
  IF _codes IS NULL OR array_length(_codes,1) IS NULL THEN
    RETURN;
  END IF;
  IF _status IS NOT NULL AND _status <> 'active' THEN
    RETURN;
  END IF;
  _kind := private.pool_kind_for_code(_code);

  SELECT EXISTS (
    SELECT 1 FROM public.member_bonus_eligibility_grants g
    WHERE g.pool_kind = _kind
      AND g.exclusive
      AND COALESCE(_on, CURRENT_DATE) BETWEEN g.starts_on AND g.ends_on
  ) INTO _exclusive;

  IF _exclusive THEN
    -- 授權期間內：名單成員全數保留，不再套用「90 天內推薦 1 位 VIP」條件。
    -- 授權到期後自動回到下方的一般條件判定。
    RETURN QUERY
    SELECT g.user_id,
           ev.legacy_code::text,
           COALESCE(ev.vip_tier_code, _codes[1])::text,
           ev.pool_ordinal::text,
           'manual_grant_exclusive'::text
    FROM public.member_bonus_eligibility_grants g
    LEFT JOIN LATERAL private.get_effective_vip_tier(g.user_id, _on) ev ON true
    WHERE g.pool_kind = _kind
      AND g.exclusive
      AND COALESCE(_on, CURRENT_DATE) BETWEEN g.starts_on AND g.ends_on
      AND (
        ev.legacy_code IS NULL
        OR private.pool_tier_matches(_codes, ev.legacy_code)
      );
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.user_id,
         ev.legacy_code::text,
         ev.vip_tier_code::text,
         ev.pool_ordinal::text,
         'get_effective_vip_tier'::text
  FROM public.dealer_tier_status s
  LEFT JOIN LATERAL private.get_effective_vip_tier(s.user_id, _on) ev ON true
  WHERE ev.vip_tier_code IS NOT NULL
    AND private.pool_tier_matches(_codes, ev.legacy_code)
    AND (_kind <> 'consumption' OR private.has_recent_vip_referral(s.user_id, _on))

  UNION

  SELECT g.user_id,
         ev.legacy_code::text,
         COALESCE(ev.vip_tier_code, _codes[1])::text,
         ev.pool_ordinal::text,
         'manual_grant'::text
  FROM public.member_bonus_eligibility_grants g
  LEFT JOIN LATERAL private.get_effective_vip_tier(g.user_id, _on) ev ON true
  WHERE g.pool_kind = _kind
    AND COALESCE(_on, CURRENT_DATE) BETWEEN g.starts_on AND g.ends_on
    AND NOT EXISTS (
      SELECT 1 FROM public.dealer_tier_status s2
      LEFT JOIN LATERAL private.get_effective_vip_tier(s2.user_id, _on) ev2 ON true
      WHERE s2.user_id = g.user_id
        AND ev2.vip_tier_code IS NOT NULL
        AND private.pool_tier_matches(_codes, ev2.legacy_code)
    );
END;
$function$;