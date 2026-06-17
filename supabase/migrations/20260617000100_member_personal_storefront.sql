-- Member personal storefront and VIP recruitment landing page

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_avatar text,
  ADD COLUMN IF NOT EXISTS profile_cover text,
  ADD COLUMN IF NOT EXISTS brand_name text,
  ADD COLUMN IF NOT EXISTS brand_intro text,
  ADD COLUMN IF NOT EXISTS line_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS youtube_url text,
  ADD COLUMN IF NOT EXISTS page_template text NOT NULL DEFAULT 'A';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_page_template_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_page_template_check
      CHECK (page_template IN ('A', 'B', 'C', 'D'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.member_featured_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_member_featured_products_member
  ON public.member_featured_products(member_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_member_featured_products_product
  ON public.member_featured_products(product_id);

ALTER TABLE public.member_featured_products ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.member_custom_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  image_url text,
  video_url text,
  purchase_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_custom_products_member
  ON public.member_custom_products(member_id, is_active, created_at DESC);

ALTER TABLE public.member_custom_products ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_member_custom_products_touch ON public.member_custom_products;
CREATE TRIGGER trg_member_custom_products_touch
  BEFORE UPDATE ON public.member_custom_products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.member_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  video_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_videos_member
  ON public.member_videos(member_id, sort_order);

ALTER TABLE public.member_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view own featured products" ON public.member_featured_products;
CREATE POLICY "Members view own featured products"
  ON public.member_featured_products
  FOR SELECT TO authenticated
  USING (
    auth.uid() = member_id
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "Members manage own featured products" ON public.member_featured_products;
CREATE POLICY "Members manage own featured products"
  ON public.member_featured_products
  FOR ALL TO authenticated
  USING (
    auth.uid() = member_id
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    auth.uid() = member_id
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "Members view own custom products" ON public.member_custom_products;
CREATE POLICY "Members view own custom products"
  ON public.member_custom_products
  FOR SELECT TO authenticated
  USING (
    auth.uid() = member_id
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "Members manage own custom products" ON public.member_custom_products;
CREATE POLICY "Members manage own custom products"
  ON public.member_custom_products
  FOR ALL TO authenticated
  USING (
    auth.uid() = member_id
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    auth.uid() = member_id
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "Members view own videos" ON public.member_videos;
CREATE POLICY "Members view own videos"
  ON public.member_videos
  FOR SELECT TO authenticated
  USING (
    auth.uid() = member_id
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "Members manage own videos" ON public.member_videos;
CREATE POLICY "Members manage own videos"
  ON public.member_videos
  FOR ALL TO authenticated
  USING (
    auth.uid() = member_id
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    auth.uid() = member_id
    OR public.has_role(auth.uid(), 'super_admin')
  );
