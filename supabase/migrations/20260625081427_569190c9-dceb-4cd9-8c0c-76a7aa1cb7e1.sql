CREATE TABLE public.homepage_featured_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, product_id)
);

CREATE INDEX idx_homepage_featured_products_active_sort
  ON public.homepage_featured_products (company_id, is_active, sort_order);

GRANT SELECT ON public.homepage_featured_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homepage_featured_products TO authenticated;
GRANT ALL ON public.homepage_featured_products TO service_role;

ALTER TABLE public.homepage_featured_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "featured_public_read_active"
  ON public.homepage_featured_products FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "featured_admin_manage"
  ON public.homepage_featured_products FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales'::app_role)
  );

CREATE TRIGGER homepage_featured_products_touch_updated_at
  BEFORE UPDATE ON public.homepage_featured_products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();