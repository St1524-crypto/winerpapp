
CREATE TABLE public.member_storefront_custom_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  cover_image text,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_msct_member ON public.member_storefront_custom_templates(member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_storefront_custom_templates TO authenticated;
GRANT ALL ON public.member_storefront_custom_templates TO service_role;

ALTER TABLE public.member_storefront_custom_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members manage own custom templates"
  ON public.member_storefront_custom_templates
  FOR ALL
  TO authenticated
  USING (member_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (member_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_msct_touch
  BEFORE UPDATE ON public.member_storefront_custom_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
