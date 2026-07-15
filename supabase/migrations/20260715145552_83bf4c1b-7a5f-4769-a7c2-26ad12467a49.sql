
-- Batch 2A: Tier mapping foundation for bonus v2 (no business logic change)

-- 1. tier_code_mapping
CREATE TABLE IF NOT EXISTS public.tier_code_mapping (
  legacy_code text PRIMARY KEY,
  vip_tier_code text NOT NULL,
  pool_ordinal text NULL,
  effective_from date NOT NULL DEFAULT '2026-07-16',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tier_code_mapping TO authenticated;
GRANT ALL ON public.tier_code_mapping TO service_role;

ALTER TABLE public.tier_code_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tier_code_mapping_select_auth"
  ON public.tier_code_mapping FOR SELECT TO authenticated USING (true);

CREATE POLICY "tier_code_mapping_admin_manage"
  ON public.tier_code_mapping FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Seed
INSERT INTO public.tier_code_mapping (legacy_code, vip_tier_code, pool_ordinal) VALUES
  ('V','V',NULL),
  ('S','S',NULL),
  ('T','T',NULL),
  ('E','E',NULL),
  ('A','A',NULL),
  ('V1','STAR1','1'),
  ('V2','STAR2','2'),
  ('V3','STAR3','3'),
  ('V4','STAR4','4'),
  ('V5','STAR5','5'),
  ('V6','STAR6','6'),
  ('V7','STAR7','7'),
  ('V8','DIRECTOR','D')
ON CONFLICT (legacy_code) DO UPDATE
  SET vip_tier_code = EXCLUDED.vip_tier_code,
      pool_ordinal = EXCLUDED.pool_ordinal,
      is_active = true;

-- 2. vip_tiers A threshold + alt column
ALTER TABLE public.vip_tiers
  ADD COLUMN IF NOT EXISTS required_direct_vip_alt integer;

UPDATE public.vip_tiers
  SET required_reward_points = 35000,
      required_direct_vip_alt = 50
  WHERE code = 'A';

-- 3. national_bonus_pool_settings
CREATE TABLE IF NOT EXISTS public.national_bonus_pool_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_code text NOT NULL UNIQUE,
  pool_rate numeric NOT NULL DEFAULT 0.02,
  income_cap_amount numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT '2026-07-16',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.national_bonus_pool_settings TO authenticated;
GRANT ALL ON public.national_bonus_pool_settings TO service_role;

ALTER TABLE public.national_bonus_pool_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nbps_select_active_auth"
  ON public.national_bonus_pool_settings FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "nbps_admin_manage"
  ON public.national_bonus_pool_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

INSERT INTO public.national_bonus_pool_settings (tier_code, pool_rate, income_cap_amount) VALUES
  ('STAR5', 0.02, 200000),
  ('STAR6', 0.02, 300000),
  ('STAR7', 0.02, 400000),
  ('DIRECTOR', 0.02, 500000)
ON CONFLICT (tier_code) DO NOTHING;

-- 4. national_bonus_pool_ledger
CREATE TABLE IF NOT EXISTS public.national_bonus_pool_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL,
  tier_code text NOT NULL,
  settlement_date date NOT NULL,
  source_total_points numeric NOT NULL DEFAULT 0,
  pool_amount numeric NOT NULL DEFAULT 0,
  distributed_points numeric NOT NULL DEFAULT 0,
  cap_before numeric,
  cap_after numeric,
  calculation_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, tier_code, settlement_date)
);

CREATE INDEX IF NOT EXISTS idx_nbpl_settlement_date ON public.national_bonus_pool_ledger(settlement_date);
CREATE INDEX IF NOT EXISTS idx_nbpl_member ON public.national_bonus_pool_ledger(member_id);

GRANT SELECT ON public.national_bonus_pool_ledger TO authenticated;
GRANT ALL ON public.national_bonus_pool_ledger TO service_role;

ALTER TABLE public.national_bonus_pool_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nbpl_admin_finance_read"
  ON public.national_bonus_pool_ledger FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'finance')
  );

-- 5. Helper: get_effective_vip_tier
CREATE OR REPLACE FUNCTION private.get_effective_vip_tier(_member_id uuid, _on date)
RETURNS TABLE(legacy_code text, vip_tier_code text, pool_ordinal text, effective_from date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _current text;
BEGIN
  SELECT current_tier INTO _current
  FROM public.dealer_tier_status
  WHERE member_id = _member_id
  LIMIT 1;

  IF _current IS NULL THEN
    RETURN;
  END IF;

  -- If already a new-tier code, pass through
  IF _current IN ('V','S','T','E','A','STAR1','STAR2','STAR3','STAR4','STAR5','STAR6','STAR7','DIRECTOR') THEN
    RETURN QUERY
      SELECT _current::text,
             _current::text,
             m.pool_ordinal,
             COALESCE(m.effective_from, '2026-07-16'::date)
      FROM public.tier_code_mapping m
      WHERE m.legacy_code = _current AND m.is_active = true
      UNION ALL
      SELECT _current::text, _current::text, NULL::text, '2026-07-16'::date
      WHERE NOT EXISTS (SELECT 1 FROM public.tier_code_mapping m2 WHERE m2.legacy_code = _current)
      LIMIT 1;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT m.legacy_code, m.vip_tier_code, m.pool_ordinal, m.effective_from
    FROM public.tier_code_mapping m
    WHERE m.legacy_code = _current AND m.is_active = true
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION private.get_effective_vip_tier(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_effective_vip_tier(uuid, date) TO authenticated, service_role;
