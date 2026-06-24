
-- 1) Tier columns
ALTER TABLE public.vip_tiers
  ADD COLUMN IF NOT EXISTS business_bonus_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS business_bonus_cap_amount numeric NOT NULL DEFAULT 0;

-- Seed default rates if existing tiers match known codes (only when current value is 0)
UPDATE public.vip_tiers SET business_bonus_rate = 0.05 WHERE upper(code) = 'E' AND COALESCE(business_bonus_rate,0) = 0;
UPDATE public.vip_tiers SET business_bonus_rate = 0.06 WHERE upper(code) = 'A' AND COALESCE(business_bonus_rate,0) = 0;

-- 2) Ledger table
CREATE TABLE IF NOT EXISTS public.vip_business_bonus_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_order_id uuid,
  source_member_id uuid,
  tier_code text NOT NULL,
  bonus_amount numeric NOT NULL DEFAULT 0,
  payable_amount numeric NOT NULL DEFAULT 0,
  capped_amount numeric NOT NULL DEFAULT 0,
  total_before numeric NOT NULL DEFAULT 0,
  total_after numeric NOT NULL DEFAULT 0,
  cap_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('released','partial_capped','skipped_capped')),
  bonus_record_id uuid,
  dedupe_key text UNIQUE,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vip_business_bonus_ledger_member ON public.vip_business_bonus_ledger(member_id);
CREATE INDEX IF NOT EXISTS idx_vip_business_bonus_ledger_status ON public.vip_business_bonus_ledger(status);

GRANT SELECT ON public.vip_business_bonus_ledger TO authenticated;
GRANT ALL ON public.vip_business_bonus_ledger TO service_role;

ALTER TABLE public.vip_business_bonus_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view own business bonus ledger" ON public.vip_business_bonus_ledger;
CREATE POLICY "Members view own business bonus ledger"
  ON public.vip_business_bonus_ledger FOR SELECT TO authenticated
  USING (
    member_id = auth.uid()
    OR public.has_role(auth.uid(),'super_admin'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'finance'::app_role)
  );

DROP POLICY IF EXISTS "Service role manages business bonus ledger" ON public.vip_business_bonus_ledger;
CREATE POLICY "Service role manages business bonus ledger"
  ON public.vip_business_bonus_ledger FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_vip_business_bonus_ledger_updated
  BEFORE UPDATE ON public.vip_business_bonus_ledger
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) Helper: total paid
CREATE OR REPLACE FUNCTION public.get_member_business_bonus_total(_member_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(payable_amount),0)::numeric
  FROM public.vip_business_bonus_ledger
  WHERE member_id = _member_id
    AND status IN ('released','partial_capped')
$$;

-- 4) Helper: cap & rate by member's current tier
CREATE OR REPLACE FUNCTION public.get_member_business_bonus_cap(_member_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(vt.business_bonus_cap_amount, 0)::numeric
  FROM public.vip_tiers vt
  WHERE vt.code = public.get_member_vip_tier_code(_member_id)
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_member_business_bonus_rate(_member_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(vt.business_bonus_rate, 0)::numeric
  FROM public.vip_tiers vt
  WHERE vt.code = public.get_member_vip_tier_code(_member_id)
  LIMIT 1
$$;

-- 5) Calc (no write)
CREATE OR REPLACE FUNCTION public.calc_business_bonus_release(_member_id uuid, _tier_code text, _bonus_amount numeric)
RETURNS TABLE(
  bonus_amount numeric, payable_amount numeric, capped_amount numeric,
  total_before numeric, total_after numeric, cap_amount numeric, status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cap numeric; _before numeric; _remain numeric;
  _payable numeric; _capped numeric; _status text;
BEGIN
  IF _bonus_amount IS NULL OR _bonus_amount < 0 THEN _bonus_amount := 0; END IF;

  SELECT COALESCE(vt.business_bonus_cap_amount, 0) INTO _cap
  FROM public.vip_tiers vt WHERE vt.code = upper(_tier_code) LIMIT 1;
  _cap := COALESCE(_cap, 0);

  _before := public.get_member_business_bonus_total(_member_id);
  _remain := GREATEST(_cap - _before, 0);

  IF _cap = 0 THEN
    _payable := _bonus_amount; _capped := 0; _status := 'released';
  ELSIF _remain <= 0 THEN
    _payable := 0; _capped := _bonus_amount; _status := 'skipped_capped';
  ELSIF _bonus_amount <= _remain THEN
    _payable := _bonus_amount; _capped := 0; _status := 'released';
  ELSE
    _payable := _remain; _capped := _bonus_amount - _remain; _status := 'partial_capped';
  END IF;

  RETURN QUERY SELECT _bonus_amount, _payable, _capped, _before, _before + _payable, _cap, _status;
END;
$$;

-- 6) Record (write with dedupe + lock)
CREATE OR REPLACE FUNCTION public.record_business_bonus_release(
  _member_id uuid, _bonus_amount numeric,
  _source_member_id uuid DEFAULT NULL,
  _source_order_id uuid DEFAULT NULL,
  _tier_code text DEFAULT NULL,
  _dedupe_key text DEFAULT NULL,
  _bonus_record_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS public.vip_business_bonus_ledger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tier text; _calc record;
  _row public.vip_business_bonus_ledger;
  _existing public.vip_business_bonus_ledger;
BEGIN
  IF _member_id IS NULL THEN RAISE EXCEPTION 'member_id required'; END IF;

  IF _dedupe_key IS NOT NULL THEN
    SELECT * INTO _existing FROM public.vip_business_bonus_ledger WHERE dedupe_key = _dedupe_key LIMIT 1;
    IF FOUND THEN RETURN _existing; END IF;
  END IF;

  _tier := upper(COALESCE(NULLIF(_tier_code,''), public.get_member_vip_tier_code(_member_id)));

  PERFORM 1 FROM public.vip_business_bonus_ledger WHERE member_id = _member_id FOR UPDATE;

  SELECT * INTO _calc FROM public.calc_business_bonus_release(_member_id, _tier, _bonus_amount);

  INSERT INTO public.vip_business_bonus_ledger(
    member_id, source_member_id, source_order_id, tier_code,
    bonus_amount, payable_amount, capped_amount,
    total_before, total_after, cap_amount, status,
    bonus_record_id, dedupe_key, notes, created_by
  ) VALUES (
    _member_id, _source_member_id, _source_order_id, _tier,
    _calc.bonus_amount, _calc.payable_amount, _calc.capped_amount,
    _calc.total_before, _calc.total_after, _calc.cap_amount, _calc.status,
    _bonus_record_id, _dedupe_key, _notes, auth.uid()
  ) RETURNING * INTO _row;

  RETURN _row;
END;
$$;
