
-- 1. profiles 增加 vip_tier
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vip_tier text;

-- 2. vip_tiers
CREATE TABLE IF NOT EXISTS public.vip_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  required_reward_points int NOT NULL DEFAULT 0,
  required_direct_vip int NOT NULL DEFAULT 0,
  required_mentor_tier text,
  required_mentor_count int NOT NULL DEFAULT 0,
  cashback_rate numeric NOT NULL DEFAULT 0,
  revenue_share_rate numeric NOT NULL DEFAULT 0,
  upgrade_bonus_cap numeric NOT NULL DEFAULT 0,
  renewal_window_days int NOT NULL DEFAULT 0,
  renewal_required_new_vip int NOT NULL DEFAULT 0,
  extra_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vip_tiers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vip_tiers TO authenticated;
GRANT ALL ON public.vip_tiers TO service_role;
ALTER TABLE public.vip_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vip_tiers public read active" ON public.vip_tiers
  FOR SELECT TO anon, authenticated USING (status = 'active');
CREATE POLICY "vip_tiers admin manage" ON public.vip_tiers
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_vip_tiers_updated BEFORE UPDATE ON public.vip_tiers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. vip_upgrade_packages
CREATE TABLE IF NOT EXISTS public.vip_upgrade_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_code text NOT NULL REFERENCES public.vip_tiers(code) ON UPDATE CASCADE,
  name text NOT NULL,
  description text,
  price numeric NOT NULL DEFAULT 0,
  bonus_points int NOT NULL DEFAULT 0,
  duration_days int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vip_upgrade_packages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vip_upgrade_packages TO authenticated;
GRANT ALL ON public.vip_upgrade_packages TO service_role;
ALTER TABLE public.vip_upgrade_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vip_packages public read active" ON public.vip_upgrade_packages
  FOR SELECT TO anon, authenticated USING (status = 'active');
CREATE POLICY "vip_packages admin manage" ON public.vip_upgrade_packages
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_vip_packages_updated BEFORE UPDATE ON public.vip_upgrade_packages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. vip_upgrade_orders
CREATE TABLE IF NOT EXISTS public.vip_upgrade_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.vip_upgrade_packages(id) ON DELETE SET NULL,
  tier_code text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  bonus_points int NOT NULL DEFAULT 0,
  payment_method text,
  payment_status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  applied_at timestamptz,
  previous_tier text,
  new_tier text,
  sales_order_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vip_upgrade_orders_user ON public.vip_upgrade_orders(user_id);
CREATE INDEX idx_vip_upgrade_orders_status ON public.vip_upgrade_orders(payment_status);
GRANT SELECT, INSERT, UPDATE ON public.vip_upgrade_orders TO authenticated;
GRANT ALL ON public.vip_upgrade_orders TO service_role;
ALTER TABLE public.vip_upgrade_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vip_orders self view" ON public.vip_upgrade_orders
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'admin'::app_role)
    OR private.has_role(auth.uid(),'finance'::app_role)
  );
CREATE POLICY "vip_orders self insert" ON public.vip_upgrade_orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vip_orders admin update" ON public.vip_upgrade_orders
  FOR UPDATE TO authenticated USING (
    private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'admin'::app_role)
  );
CREATE TRIGGER trg_vip_orders_updated BEFORE UPDATE ON public.vip_upgrade_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. seed V/S/T/E/A
INSERT INTO public.vip_tiers (code, name, sort_order, required_reward_points, required_direct_vip, required_mentor_tier, required_mentor_count, cashback_rate, revenue_share_rate, upgrade_bonus_cap, renewal_window_days, renewal_required_new_vip, extra_config, description)
VALUES
  ('V','V 級 VIP',1,800,0,NULL,0,5,0,0,0,0,'{}'::jsonb,'入門 VIP'),
  ('S','S 級 VIP',2,3500,10,NULL,0,10,0,0,0,0,'{}'::jsonb,'進階 VIP'),
  ('T','T 級 VIP',3,9000,20,'S',3,20,0,0,0,0,'{}'::jsonb,'資深 VIP'),
  ('E','E 級 VIP',4,21000,30,'T',3,40,5,36800,180,1,'{}'::jsonb,'菁英 VIP'),
  ('A','A 級 VIP',5,70000,50,NULL,0,50,6,68000,180,1,'{"developer_group_rate":5,"developer_group_monthly_new_vip":10}'::jsonb,'頂級 VIP')
ON CONFLICT (code) DO NOTHING;
