CREATE TABLE IF NOT EXISTS public.monthly_tier_bonus_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  threshold_points integer NOT NULL,
  bonus_rate numeric(5,2) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (threshold_points)
);

GRANT SELECT ON public.monthly_tier_bonus_settings TO authenticated;
GRANT ALL ON public.monthly_tier_bonus_settings TO service_role;

ALTER TABLE public.monthly_tier_bonus_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read monthly tier bonus"
ON public.monthly_tier_bonus_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage monthly tier bonus"
ON public.monthly_tier_bonus_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))
WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));

CREATE TRIGGER touch_monthly_tier_bonus_settings
BEFORE UPDATE ON public.monthly_tier_bonus_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.monthly_tier_bonus_settings (threshold_points, bonus_rate, sort_order) VALUES
  (10000, 5, 1),
  (20000, 6, 2),
  (30000, 7, 3),
  (50000, 6, 4),
  (100000, 10, 5)
ON CONFLICT (threshold_points) DO NOTHING;