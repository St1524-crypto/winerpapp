-- Dealer program configurable settings (key-value)
CREATE TABLE IF NOT EXISTS public.dealer_program_settings (
  key text PRIMARY KEY,
  value numeric NOT NULL DEFAULT 0,
  unit text,
  label text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.dealer_program_settings TO authenticated;
GRANT ALL ON public.dealer_program_settings TO service_role;

ALTER TABLE public.dealer_program_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view dealer settings"
  ON public.dealer_program_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manage dealer settings"
  ON public.dealer_program_settings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role));

-- Per-dealer running metrics
CREATE TABLE IF NOT EXISTS public.dealer_metrics (
  user_id uuid PRIMARY KEY,
  current_pv numeric NOT NULL DEFAULT 0,
  direct_vip_count integer NOT NULL DEFAULT 0,
  monthly_personal_points numeric NOT NULL DEFAULT 0,
  monthly_income numeric NOT NULL DEFAULT 0,
  maintenance_started_at timestamptz,
  maintenance_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dealer_metrics TO authenticated;
GRANT ALL ON public.dealer_metrics TO service_role;

ALTER TABLE public.dealer_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own metrics"
  ON public.dealer_metrics FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role) OR private.has_role(auth.uid(),'sales'::app_role));

CREATE POLICY "Admin manage metrics"
  ON public.dealer_metrics FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role));

-- Seed defaults
INSERT INTO public.dealer_program_settings (key, value, unit, label, description, category) VALUES
  ('maintenance_window', 180, 'days', '考核窗口期', '經銷商考核期間（天）', 'qualification'),
  ('rebate_rate', 5, '%', '回饋點數百分比', '訂單回饋點數比例', 'rewards'),
  ('operating_bonus_rate', 10, '%', '營業分紅百分比', '營業額分紅比例', 'rewards'),
  ('upgrade_bonus_cap', 100000, 'NT$', '升級分紅總量上限', '升級分紅最高累計上限', 'rewards'),
  ('global_bonus_min_income', 50000, 'NT$', '全球分紅月收入門檻', '判定全球分紅資格的最低當月收入', 'qualification'),
  ('first_purchase_pv_required', 100, 'PV', '首購PV門檻', '經銷商首購最低PV值', 'qualification'),
  ('monthly_points_required', 50, '點', '每月個人責任額', '每月需達成的個人責任額點數', 'qualification')
ON CONFLICT (key) DO NOTHING;