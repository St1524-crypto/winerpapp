
-- ===== vip_bonus_pools =====
CREATE TABLE IF NOT EXISTS public.vip_bonus_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,
  tier_codes text[] NOT NULL DEFAULT '{}',
  bonus_rate numeric(6,4) NOT NULL DEFAULT 0.05,
  distribution_method text NOT NULL DEFAULT 'equal',
  apply_total_income_cap boolean NOT NULL DEFAULT true,
  total_income_cap_amount numeric(14,2),
  sort_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CHECK (status IN ('active','inactive')),
  CHECK (distribution_method IN ('equal')),
  CHECK (bonus_rate >= 0 AND bonus_rate <= 1)
);

GRANT SELECT ON public.vip_bonus_pools TO authenticated;
GRANT ALL ON public.vip_bonus_pools TO service_role;

ALTER TABLE public.vip_bonus_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage vip_bonus_pools"
ON public.vip_bonus_pools FOR ALL TO authenticated
USING (
  private.has_role(auth.uid(),'super_admin'::app_role)
  OR private.has_role(auth.uid(),'admin'::app_role)
  OR private.has_role(auth.uid(),'finance'::app_role)
) WITH CHECK (
  private.has_role(auth.uid(),'super_admin'::app_role)
  OR private.has_role(auth.uid(),'admin'::app_role)
  OR private.has_role(auth.uid(),'finance'::app_role)
);

CREATE POLICY "authenticated read active vip_bonus_pools"
ON public.vip_bonus_pools FOR SELECT TO authenticated
USING (status = 'active');

CREATE TRIGGER trg_vip_bonus_pools_touch
BEFORE UPDATE ON public.vip_bonus_pools
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== vip_bonus_pool_payouts =====
CREATE TABLE IF NOT EXISTS public.vip_bonus_pool_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.vip_bonus_pools(id) ON DELETE CASCADE,
  payout_date date NOT NULL,
  member_id uuid,
  tier_code text,
  daily_total_reward_points numeric(14,2) NOT NULL DEFAULT 0,
  bonus_rate numeric(6,4) NOT NULL DEFAULT 0,
  pool_amount numeric(14,2) NOT NULL DEFAULT 0,
  eligible_member_count int NOT NULL DEFAULT 0,
  bonus_amount numeric(14,2) NOT NULL DEFAULT 0,
  payable_amount numeric(14,2) NOT NULL DEFAULT 0,
  capped_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_before numeric(14,2) NOT NULL DEFAULT 0,
  total_after numeric(14,2) NOT NULL DEFAULT 0,
  cap_amount numeric(14,2),
  status text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CHECK (status IN ('released','partial_capped','skipped_capped','no_eligible_members','preview'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vip_bonus_pool_payouts_member_day
  ON public.vip_bonus_pool_payouts(pool_id, payout_date, member_id)
  WHERE member_id IS NOT NULL AND status <> 'preview';

CREATE INDEX IF NOT EXISTS idx_vip_bonus_pool_payouts_pool_date
  ON public.vip_bonus_pool_payouts(pool_id, payout_date);

GRANT SELECT ON public.vip_bonus_pool_payouts TO authenticated;
GRANT ALL ON public.vip_bonus_pool_payouts TO service_role;

ALTER TABLE public.vip_bonus_pool_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins view all vip_bonus_pool_payouts"
ON public.vip_bonus_pool_payouts FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(),'super_admin'::app_role)
  OR private.has_role(auth.uid(),'admin'::app_role)
  OR private.has_role(auth.uid(),'finance'::app_role)
);

CREATE POLICY "members view own vip_bonus_pool_payouts"
ON public.vip_bonus_pool_payouts FOR SELECT TO authenticated
USING (member_id = auth.uid());

-- ===== calculation helper =====
CREATE OR REPLACE FUNCTION public.calc_vip_bonus_pool_daily(
  _pool_id uuid,
  _daily_total_reward_points numeric,
  _eligible_member_count int
)
RETURNS TABLE(
  pool_id uuid,
  bonus_rate numeric,
  pool_amount numeric,
  per_member_amount numeric,
  eligible_member_count int,
  status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _rate numeric;
  _pool numeric;
  _per numeric;
  _status text;
BEGIN
  SELECT vp.bonus_rate INTO _rate
  FROM public.vip_bonus_pools vp WHERE vp.id = _pool_id;
  IF _rate IS NULL THEN
    RAISE EXCEPTION 'pool not found';
  END IF;

  _pool := COALESCE(_daily_total_reward_points,0) * _rate;

  IF COALESCE(_eligible_member_count,0) <= 0 THEN
    _per := 0;
    _status := 'no_eligible_members';
  ELSE
    _per := _pool / _eligible_member_count;
    _status := 'released';
  END IF;

  RETURN QUERY SELECT _pool_id, _rate, _pool, _per, COALESCE(_eligible_member_count,0), _status;
END;
$$;

-- ===== seed default pools =====
INSERT INTO public.vip_bonus_pools(name, code, tier_codes, bonus_rate, sort_order, description)
VALUES
  ('一/二/三星 共享池','POOL_123', ARRAY['1','2','3'], 0.05, 1, '一星、二星、三星共享 5% 平均分配'),
  ('三/四/五星 共享池 A','POOL_345_A', ARRAY['3','4','5'], 0.05, 2, '三星、四星、五星共享 5% 平均分配'),
  ('三/四/五星 共享池 B','POOL_345_B', ARRAY['3','4','5'], 0.05, 3, '三星、四星、五星共享 5% 平均分配（第二池）'),
  ('六/七星/董事 共享池','POOL_67D', ARRAY['6','7','D'], 0.05, 4, '六星、七星、董事共享 5% 平均分配')
ON CONFLICT (code) DO NOTHING;
