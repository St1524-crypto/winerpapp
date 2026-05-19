
-- =========================================================
-- categories
-- =========================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  image text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view categories" ON public.categories;
CREATE POLICY "Authenticated view categories" ON public.categories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
CREATE POLICY "Admins manage categories" ON public.categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'warehouse'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'warehouse'));

DROP TRIGGER IF EXISTS trg_categories_touch ON public.categories;
CREATE TRIGGER trg_categories_touch BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- products: extend columns
-- =========================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wholesale_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS safe_stock integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_products_touch ON public.products;
CREATE TRIGGER trg_products_touch BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);

-- =========================================================
-- product_images
-- =========================================================
CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view product images" ON public.product_images;
CREATE POLICY "Authenticated view product images" ON public.product_images
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff manage product images" ON public.product_images;
CREATE POLICY "Staff manage product images" ON public.product_images
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'warehouse'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'warehouse'));

CREATE INDEX IF NOT EXISTS idx_product_images_product ON public.product_images(product_id);

-- =========================================================
-- inventory_logs: extend columns
-- =========================================================
ALTER TABLE public.inventory_logs
  ADD COLUMN IF NOT EXISTS before_stock integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS after_stock integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS operator_id uuid;

CREATE INDEX IF NOT EXISTS idx_inventory_logs_product ON public.inventory_logs(product_id);

-- =========================================================
-- Storage bucket: product-images (public)
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
CREATE POLICY "Public read product images" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Staff upload product images" ON storage.objects;
CREATE POLICY "Staff upload product images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'warehouse'))
  );

DROP POLICY IF EXISTS "Staff update product images" ON storage.objects;
CREATE POLICY "Staff update product images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'warehouse'))
  );

DROP POLICY IF EXISTS "Staff delete product images" ON storage.objects;
CREATE POLICY "Staff delete product images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'warehouse'))
  );

-- =========================================================
-- Seed: categories
-- =========================================================
INSERT INTO public.categories (name, sort_order) VALUES
  ('HEALTH', 1),
  ('BEAUTY', 2),
  ('FOOD', 3),
  ('HOME', 4),
  ('ELEC', 5)
ON CONFLICT DO NOTHING;
