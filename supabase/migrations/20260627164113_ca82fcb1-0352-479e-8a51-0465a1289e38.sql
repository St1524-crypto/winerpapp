-- Step 1: homepage_sections + homepage_section_products

CREATE TABLE IF NOT EXISTS public.homepage_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_type text NOT NULL,
  title text NOT NULL,
  subtitle text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  display_limit integer NOT NULL DEFAULT 8,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT homepage_sections_section_type_chk
    CHECK (section_type IN ('limited_offer','bundle','featured','best_seller','new_arrival'))
);

GRANT SELECT ON public.homepage_sections TO anon, authenticated;
GRANT ALL ON public.homepage_sections TO service_role;

ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homepage_sections_public_read_active"
  ON public.homepage_sections FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "homepage_sections_admin_all"
  ON public.homepage_sections FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.homepage_section_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.homepage_sections(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT homepage_section_products_unique UNIQUE (section_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_homepage_section_products_section
  ON public.homepage_section_products(section_id, sort_order);

GRANT SELECT ON public.homepage_section_products TO anon, authenticated;
GRANT ALL ON public.homepage_section_products TO service_role;

ALTER TABLE public.homepage_section_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homepage_section_products_public_read_active"
  ON public.homepage_section_products FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  );

CREATE POLICY "homepage_section_products_admin_all"
  ON public.homepage_section_products FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

-- updated_at triggers
CREATE TRIGGER trg_homepage_sections_updated_at
  BEFORE UPDATE ON public.homepage_sections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_homepage_section_products_updated_at
  BEFORE UPDATE ON public.homepage_section_products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Idempotent seed: 5 default sections (matched by section_type)
INSERT INTO public.homepage_sections (section_type, title, sort_order, display_limit)
VALUES
  ('limited_offer','限時特惠區',10,8),
  ('bundle','優惠套組區',20,8),
  ('featured','主力產品區',30,8),
  ('best_seller','熱賣產品區',40,8),
  ('new_arrival','新上架區',50,8)
ON CONFLICT DO NOTHING;

-- Ensure idempotency via partial unique on section_type for seed rows
CREATE UNIQUE INDEX IF NOT EXISTS uq_homepage_sections_section_type
  ON public.homepage_sections(section_type);
