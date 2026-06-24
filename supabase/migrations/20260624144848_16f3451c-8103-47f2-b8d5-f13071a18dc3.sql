
ALTER TABLE public.vip_tiers
  ADD COLUMN IF NOT EXISTS upgrade_bonus_cap_basis text NOT NULL DEFAULT 'total_earnings',
  ADD COLUMN IF NOT EXISTS upgrade_total_earnings_cap_amount numeric NOT NULL DEFAULT 0;

INSERT INTO public.system_settings (key, value, description)
VALUES (
  'upgrade_bonus_total_earnings_types',
  '["daily_bonus","monthly_bonus","referral_bonus","repurchase_bonus","upgrade_bonus","business_bonus"]'::jsonb,
  '計算會員總收益時納入的 bonus_records.bonus_type 清單（用於升級分紅總收益上限判斷）'
)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.vip_upgrade_bonus_total_earnings_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL,
  tier_code text NOT NULL,
  original_bonus_amount numeric NOT NULL DEFAULT 0,
  payable_amount numeric NOT NULL DEFAULT 0,
  capped_amount numeric NOT NULL DEFAULT 0,
  member_total_earnings_before numeric NOT NULL DEFAULT 0,
  member_total_earnings_after numeric NOT NULL DEFAULT 0,
  cap_amount numeric NOT NULL DEFAULT 0,
  cap_basis text NOT NULL DEFAULT 'total_earnings',
  included_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL CHECK (status IN ('released','partial_capped','skipped_capped','preview')),
  dedupe_key text UNIQUE,
  source_ref text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vip_upgrade_bonus_total_earnings_ledger TO authenticated;
GRANT ALL ON public.vip_upgrade_bonus_total_earnings_ledger TO service_role;

ALTER TABLE public.vip_upgrade_bonus_total_earnings_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can view own total-earnings ledger"
ON public.vip_upgrade_bonus_total_earnings_ledger
FOR SELECT TO authenticated
USING (member_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'finance'));

CREATE POLICY "service role manage total-earnings ledger"
ON public.vip_upgrade_bonus_total_earnings_ledger
FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_vubtel_member ON public.vip_upgrade_bonus_total_earnings_ledger(member_id, created_at DESC);

CREATE TRIGGER trg_vubtel_updated_at
BEFORE UPDATE ON public.vip_upgrade_bonus_total_earnings_ledger
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.get_upgrade_bonus_total_earnings_types()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT ARRAY(SELECT jsonb_array_elements_text(value)) FROM public.system_settings WHERE key='upgrade_bonus_total_earnings_types'),
    ARRAY['daily_bonus','monthly_bonus','referral_bonus','repurchase_bonus','upgrade_bonus','business_bonus']
  );
$$;

CREATE OR REPLACE FUNCTION public.get_member_total_earnings(_member_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(COALESCE(br.base_amount,0)),0)
  FROM public.bonus_records br
  WHERE br.member_id = _member_id
    AND br.status IN ('released','paid','settled')
    AND br.bonus_type = ANY (public.get_upgrade_bonus_total_earnings_types());
$$;

CREATE OR REPLACE FUNCTION public.get_tier_upgrade_total_earnings_cap(_tier_code text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(upgrade_total_earnings_cap_amount,0)
  FROM public.vip_tiers
  WHERE upper(code) = upper(_tier_code)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.calc_upgrade_bonus_total_earnings_release(
  _member_id uuid,
  _tier_code text,
  _bonus_amount numeric
) RETURNS TABLE (
  original_bonus_amount numeric,
  payable_amount numeric,
  capped_amount numeric,
  member_total_earnings_before numeric,
  member_total_earnings_after numeric,
  cap_amount numeric,
  cap_basis text,
  status text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total numeric := public.get_member_total_earnings(_member_id);
  v_cap numeric := public.get_tier_upgrade_total_earnings_cap(_tier_code);
  v_remaining numeric;
  v_payable numeric;
  v_capped numeric;
  v_status text;
BEGIN
  IF v_cap <= 0 THEN
    RETURN QUERY SELECT _bonus_amount, _bonus_amount, 0::numeric, v_total, v_total + _bonus_amount, v_cap, 'total_earnings'::text, 'released'::text;
    RETURN;
  END IF;

  IF v_total >= v_cap THEN
    RETURN QUERY SELECT _bonus_amount, 0::numeric, _bonus_amount, v_total, v_total, v_cap, 'total_earnings'::text, 'skipped_capped'::text;
    RETURN;
  END IF;

  v_remaining := v_cap - v_total;
  IF _bonus_amount <= v_remaining THEN
    v_payable := _bonus_amount;
    v_capped := 0;
    v_status := 'released';
  ELSE
    v_payable := v_remaining;
    v_capped := _bonus_amount - v_remaining;
    v_status := 'partial_capped';
  END IF;

  RETURN QUERY SELECT _bonus_amount, v_payable, v_capped, v_total, v_total + v_payable, v_cap, 'total_earnings'::text, v_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_upgrade_bonus_total_earnings_types() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_member_total_earnings(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tier_upgrade_total_earnings_cap(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calc_upgrade_bonus_total_earnings_release(uuid, text, numeric) TO authenticated, service_role;
