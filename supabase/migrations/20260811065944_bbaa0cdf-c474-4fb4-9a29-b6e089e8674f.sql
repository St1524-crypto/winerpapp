CREATE TABLE public.member_bonus_eligibility_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pool_kind text NOT NULL CHECK (pool_kind IN ('consumption','business')),
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pool_kind)
);

CREATE INDEX idx_mbeg_user ON public.member_bonus_eligibility_grants(user_id);
CREATE INDEX idx_mbeg_range ON public.member_bonus_eligibility_grants(pool_kind, starts_on, ends_on);

GRANT SELECT ON public.member_bonus_eligibility_grants TO authenticated;
GRANT ALL ON public.member_bonus_eligibility_grants TO service_role;

ALTER TABLE public.member_bonus_eligibility_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage bonus grants"
  ON public.member_bonus_eligibility_grants FOR ALL TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  );

CREATE POLICY "members read own bonus grants"
  ON public.member_bonus_eligibility_grants FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_mbeg_updated_at
  BEFORE UPDATE ON public.member_bonus_eligibility_grants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION private.pool_kind_for_code(_pool_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public','private','pg_temp'
AS $$
  SELECT CASE WHEN _pool_code = 'POOL_VSTEA' THEN 'consumption' ELSE 'business' END
$$;

CREATE OR REPLACE FUNCTION private.has_bonus_grant(_user_id uuid, _pool_code text, _on date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.member_bonus_eligibility_grants g
    WHERE g.user_id = _user_id
      AND g.pool_kind = private.pool_kind_for_code(_pool_code)
      AND COALESCE(_on, CURRENT_DATE) BETWEEN g.starts_on AND g.ends_on
  )
$$;

CREATE OR REPLACE FUNCTION private.list_pool_eligible_members(_pool_id uuid, _on date)
RETURNS TABLE(member_id uuid, legacy_code text, mapped_code text, pool_ordinal text, tier_mapping_source text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $function$
DECLARE
  _codes text[];
  _status text;
  _code text;
  _kind text;
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

  RETURN QUERY
  SELECT s.user_id,
         ev.legacy_code,
         ev.vip_tier_code,
         ev.pool_ordinal,
         'get_effective_vip_tier'::text
  FROM public.dealer_tier_status s
  LEFT JOIN LATERAL private.get_effective_vip_tier(s.user_id, _on) ev ON true
  WHERE ev.vip_tier_code IS NOT NULL
    AND private.pool_tier_matches(_codes, ev.legacy_code)

  UNION

  SELECT g.user_id,
         ev.legacy_code,
         COALESCE(ev.vip_tier_code, _codes[1]),
         ev.pool_ordinal,
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