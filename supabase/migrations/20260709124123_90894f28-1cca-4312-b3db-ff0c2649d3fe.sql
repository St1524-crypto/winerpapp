
CREATE TABLE public.cooperation_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_type text NOT NULL CHECK (application_type IN ('dealer','reseller','vip')),
  company_name text,
  tax_id text,
  owner_name text,
  contact_name text,
  phone text NOT NULL,
  email text NOT NULL,
  line_id text,
  city text,
  address text,
  sales_channels text[],
  sales_platform_url text,
  audience_size text,
  interested_products text,
  expected_monthly_volume text,
  has_referrer boolean,
  referrer_info text,
  interested_topics text[],
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','contacted','approved','rejected','archived')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.cooperation_applications TO anon, authenticated;
GRANT SELECT, UPDATE ON public.cooperation_applications TO authenticated;
GRANT ALL ON public.cooperation_applications TO service_role;

ALTER TABLE public.cooperation_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit cooperation applications"
  ON public.cooperation_applications
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view cooperation applications"
  ON public.cooperation_applications
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY "Admins can update cooperation applications"
  ON public.cooperation_applications
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE TRIGGER update_cooperation_applications_updated_at
  BEFORE UPDATE ON public.cooperation_applications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_cooperation_applications_status ON public.cooperation_applications(status);
CREATE INDEX idx_cooperation_applications_type ON public.cooperation_applications(application_type);
CREATE INDEX idx_cooperation_applications_created_at ON public.cooperation_applications(created_at DESC);
