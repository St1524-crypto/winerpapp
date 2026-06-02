
-- ============ 1. bonus_settings ============
CREATE TABLE public.bonus_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_bonus_auto_enabled boolean NOT NULL DEFAULT true,
  daily_bonus_cycle_days integer NOT NULL DEFAULT 1 CHECK (daily_bonus_cycle_days > 0),
  daily_next_settlement_at timestamptz NOT NULL DEFAULT (now() + interval '1 day'),
  monthly_bonus_mode text NOT NULL DEFAULT 'auto' CHECK (monthly_bonus_mode IN ('auto','manual')),
  monthly_bonus_settlement_day integer NOT NULL DEFAULT 1 CHECK (monthly_bonus_settlement_day BETWEEN 1 AND 28),
  vip_required_points integer NOT NULL DEFAULT 200 CHECK (vip_required_points >= 0),
  reward_release_days integer NOT NULL DEFAULT 7 CHECK (reward_release_days >= 0),
  reward_release_mode text NOT NULL DEFAULT 'auto' CHECK (reward_release_mode IN ('auto','manual')),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bonus_settings TO authenticated;
GRANT ALL ON public.bonus_settings TO service_role;
ALTER TABLE public.bonus_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_settings read all auth" ON public.bonus_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "bonus_settings admin write" ON public.bonus_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));

INSERT INTO public.bonus_settings (singleton) VALUES (true);

-- ============ 2. repurchase_bonus_settings ============
CREATE TABLE public.repurchase_bonus_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_level integer NOT NULL UNIQUE CHECK (generation_level > 0),
  bonus_rate numeric(6,2) NOT NULL DEFAULT 10 CHECK (bonus_rate >= 0),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.repurchase_bonus_settings TO authenticated;
GRANT ALL ON public.repurchase_bonus_settings TO service_role;
ALTER TABLE public.repurchase_bonus_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rb read all auth" ON public.repurchase_bonus_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "rb admin write" ON public.repurchase_bonus_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));

INSERT INTO public.repurchase_bonus_settings (generation_level, bonus_rate) VALUES (1,10),(2,10);

-- ============ 3. rank_rebate_settings ============
CREATE TABLE public.rank_rebate_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rank_code text NOT NULL UNIQUE,
  rank_name text NOT NULL,
  required_points integer NOT NULL DEFAULT 200 CHECK (required_points >= 0),
  exceeded_rebate_rate numeric(6,2) NOT NULL DEFAULT 0 CHECK (exceeded_rebate_rate >= 0),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rank_rebate_settings TO authenticated;
GRANT ALL ON public.rank_rebate_settings TO service_role;
ALTER TABLE public.rank_rebate_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rr read all auth" ON public.rank_rebate_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "rr admin write" ON public.rank_rebate_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));

INSERT INTO public.rank_rebate_settings (rank_code, rank_name, required_points, exceeded_rebate_rate, sort_order) VALUES
  ('vip','VIP',200,5,1),
  ('svip','SVIP',200,8,2),
  ('tvip','TVIP',200,10,3);

-- ============ 4. bonus_settlement_batches ============
CREATE TABLE public.bonus_settlement_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_type text NOT NULL CHECK (settlement_type IN ('daily','monthly')),
  settlement_period_start date NOT NULL,
  settlement_period_end date NOT NULL,
  total_members integer NOT NULL DEFAULT 0,
  total_bonus_points integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT ON public.bonus_settlement_batches TO authenticated;
GRANT ALL ON public.bonus_settlement_batches TO service_role;
ALTER TABLE public.bonus_settlement_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "batches admin all" ON public.bonus_settlement_batches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'sales'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));

-- ============ 5. bonus_records ============
CREATE TABLE public.bonus_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL,
  source_member_id uuid,
  source_order_id uuid,
  bonus_type text NOT NULL CHECK (bonus_type IN ('referral','repurchase','monthly_vip','rank_rebate')),
  generation_level integer,
  base_amount numeric(14,2) NOT NULL DEFAULT 0,
  bonus_rate numeric(6,2) NOT NULL DEFAULT 0,
  bonus_points integer NOT NULL DEFAULT 0,
  required_points_checked boolean NOT NULL DEFAULT false,
  required_points_passed boolean NOT NULL DEFAULT true,
  fail_reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settled','waiting_release','released','cancelled','failed')),
  settlement_batch_id uuid REFERENCES public.bonus_settlement_batches(id) ON DELETE SET NULL,
  settlement_date date,
  release_date date,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bonus_records_member ON public.bonus_records (member_id, created_at DESC);
CREATE INDEX idx_bonus_records_status ON public.bonus_records (status, release_date);
CREATE INDEX idx_bonus_records_batch ON public.bonus_records (settlement_batch_id);
-- 冪等：訂單型獎金每代每人最多一次
CREATE UNIQUE INDEX uniq_bonus_records_order ON public.bonus_records (source_order_id, member_id, bonus_type, COALESCE(generation_level,0))
  WHERE source_order_id IS NOT NULL;
-- 月獎金/位階回饋冪等
CREATE UNIQUE INDEX uniq_bonus_records_monthly ON public.bonus_records (member_id, bonus_type, settlement_date)
  WHERE bonus_type IN ('monthly_vip','rank_rebate') AND settlement_date IS NOT NULL;

GRANT SELECT ON public.bonus_records TO authenticated;
GRANT ALL ON public.bonus_records TO service_role;
ALTER TABLE public.bonus_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_records owner read" ON public.bonus_records FOR SELECT TO authenticated
  USING (member_id = auth.uid()
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'finance')
    OR public.has_role(auth.uid(),'sales'));
CREATE POLICY "bonus_records admin write" ON public.bonus_records FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));

-- ============ 6. reward_wallet_logs ============
CREATE TABLE public.reward_wallet_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL,
  bonus_record_id uuid REFERENCES public.bonus_records(id) ON DELETE SET NULL,
  points integer NOT NULL,
  type text NOT NULL CHECK (type IN ('earn','cancel','adjust')),
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed')),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rwl_member ON public.reward_wallet_logs (member_id, created_at DESC);
GRANT SELECT ON public.reward_wallet_logs TO authenticated;
GRANT ALL ON public.reward_wallet_logs TO service_role;
ALTER TABLE public.reward_wallet_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rwl owner read" ON public.reward_wallet_logs FOR SELECT TO authenticated
  USING (member_id = auth.uid()
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'finance')
    OR public.has_role(auth.uid(),'sales'));
CREATE POLICY "rwl admin write" ON public.reward_wallet_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));

-- updated_at triggers
CREATE TRIGGER trg_bonus_settings_updated BEFORE UPDATE ON public.bonus_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_rb_updated BEFORE UPDATE ON public.repurchase_bonus_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_rr_updated BEFORE UPDATE ON public.rank_rebate_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_bonus_records_updated BEFORE UPDATE ON public.bonus_records FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
