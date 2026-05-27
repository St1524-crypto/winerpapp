-- Tier definitions (configurable)
CREATE TABLE IF NOT EXISTS public.dealer_tiers (
  code text PRIMARY KEY,
  name text NOT NULL,
  tier_type text NOT NULL DEFAULT 'member',
  sort_order integer NOT NULL DEFAULT 0,
  required_pv numeric NOT NULL DEFAULT 0,
  required_direct_vip integer NOT NULL DEFAULT 0,
  required_mentor_tier text,
  required_mentor_count integer NOT NULL DEFAULT 0,
  condition_logic text NOT NULL DEFAULT 'OR',
  rebate_rate numeric NOT NULL DEFAULT 0,
  operating_bonus_rate numeric NOT NULL DEFAULT 0,
  upgrade_bonus_cap numeric NOT NULL DEFAULT 0,
  special_bonus_rate numeric NOT NULL DEFAULT 0,
  special_bonus_trigger_count integer NOT NULL DEFAULT 0,
  special_bonus_label text,
  maintenance_window_days integer NOT NULL DEFAULT 0,
  maintenance_required_vip integer NOT NULL DEFAULT 0,
  description text,
  status text NOT NULL DEFAULT 'active',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dealer_tiers TO authenticated;
GRANT ALL ON public.dealer_tiers TO service_role;
ALTER TABLE public.dealer_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view tiers" ON public.dealer_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage tiers" ON public.dealer_tiers FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role));

-- Per-user tier status
CREATE TABLE IF NOT EXISTS public.dealer_tier_status (
  user_id uuid PRIMARY KEY,
  current_tier text REFERENCES public.dealer_tiers(code),
  promoted_at timestamptz,
  maintenance_started_at timestamptz,
  maintenance_expires_at timestamptz,
  maintenance_new_vip_count integer NOT NULL DEFAULT 0,
  monthly_new_vip_count integer NOT NULL DEFAULT 0,
  special_bonus_active boolean NOT NULL DEFAULT false,
  special_bonus_month text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dealer_tier_status TO authenticated;
GRANT ALL ON public.dealer_tier_status TO service_role;
ALTER TABLE public.dealer_tier_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tier status" ON public.dealer_tier_status FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role) OR private.has_role(auth.uid(),'sales'::app_role));
CREATE POLICY "Admin manage tier status" ON public.dealer_tier_status FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role));

-- Tier change history
CREATE TABLE IF NOT EXISTS public.dealer_tier_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  from_tier text,
  to_tier text,
  change_type text NOT NULL DEFAULT 'promotion',
  reason text,
  triggered_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dealer_tier_history TO authenticated;
GRANT ALL ON public.dealer_tier_history TO service_role;
ALTER TABLE public.dealer_tier_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tier history" ON public.dealer_tier_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role) OR private.has_role(auth.uid(),'sales'::app_role));

-- Seed tier definitions
INSERT INTO public.dealer_tiers (code, name, tier_type, sort_order, required_pv, required_direct_vip, required_mentor_tier, required_mentor_count, condition_logic, rebate_rate, operating_bonus_rate, upgrade_bonus_cap, special_bonus_rate, special_bonus_trigger_count, special_bonus_label, maintenance_window_days, maintenance_required_vip, description) VALUES
  ('V','V 階級','member',1,800,0,NULL,0,'OR',5,0,0,0,0,NULL,0,0,'基礎會員入門階級'),
  ('S','S 階級','member',2,3500,10,NULL,0,'OR',10,0,0,0,0,NULL,0,0,'基礎會員進階'),
  ('T','T 階級','member',3,9000,20,'S',3,'OR',20,0,0,0,0,NULL,0,0,'基礎會員高階；亦可由 S 級輔導 3 位 S 達成'),
  ('E','E 代理店','agent',4,21000,30,'T',3,'OR',40,5,36800,0,0,NULL,180,1,'代理店；每 180 天需新增 1 位 VIP'),
  ('A','A 代理店','agent',5,70000,50,NULL,0,'OR',50,6,68000,5,10,'開發專員小組',180,1,'A 代理店；當月新增 10 位 VIP 觸發開發專員小組 5%')
ON CONFLICT (code) DO NOTHING;