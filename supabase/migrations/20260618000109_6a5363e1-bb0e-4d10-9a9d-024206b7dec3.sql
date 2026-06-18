
-- Ensure profiles has storefront columns
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

-- Ensure bonus_records has retry/failure tracking columns
ALTER TABLE public.bonus_records
  ADD COLUMN IF NOT EXISTS release_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS release_source text,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

-- Member storefront: featured products from catalog
CREATE TABLE IF NOT EXISTS public.member_featured_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_featured_products TO authenticated;
GRANT SELECT ON public.member_featured_products TO anon;
GRANT ALL ON public.member_featured_products TO service_role;
ALTER TABLE public.member_featured_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read featured" ON public.member_featured_products;
CREATE POLICY "public read featured" ON public.member_featured_products FOR SELECT USING (true);
DROP POLICY IF EXISTS "members manage own featured" ON public.member_featured_products;
CREATE POLICY "members manage own featured" ON public.member_featured_products FOR ALL TO authenticated USING (member_id = auth.uid()) WITH CHECK (member_id = auth.uid());

-- Member storefront: custom (external) products
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_custom_products TO authenticated;
GRANT SELECT ON public.member_custom_products TO anon;
GRANT ALL ON public.member_custom_products TO service_role;
ALTER TABLE public.member_custom_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read custom" ON public.member_custom_products;
CREATE POLICY "public read custom" ON public.member_custom_products FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "members manage own custom" ON public.member_custom_products;
CREATE POLICY "members manage own custom" ON public.member_custom_products FOR ALL TO authenticated USING (member_id = auth.uid()) WITH CHECK (member_id = auth.uid());

-- Member storefront: videos
CREATE TABLE IF NOT EXISTS public.member_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  video_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_videos TO authenticated;
GRANT SELECT ON public.member_videos TO anon;
GRANT ALL ON public.member_videos TO service_role;
ALTER TABLE public.member_videos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read videos" ON public.member_videos;
CREATE POLICY "public read videos" ON public.member_videos FOR SELECT USING (true);
DROP POLICY IF EXISTS "members manage own videos" ON public.member_videos;
CREATE POLICY "members manage own videos" ON public.member_videos FOR ALL TO authenticated USING (member_id = auth.uid()) WITH CHECK (member_id = auth.uid());
