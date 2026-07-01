-- Shop content management for wholesale, patents, news, and health sections.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.shop_content_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_type text NOT NULL,
  title text NOT NULL,
  slug text NOT NULL,
  summary text,
  cover_image text,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_html text,
  external_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_content_pages_section_type_check
    CHECK (section_type IN ('wholesale', 'patent', 'news', 'health')),
  CONSTRAINT shop_content_pages_slug_format_check
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_content_pages_section_slug
  ON public.shop_content_pages (section_type, slug);

CREATE INDEX IF NOT EXISTS idx_shop_content_pages_public
  ON public.shop_content_pages (section_type, is_published, sort_order, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_shop_content_pages_updated
  ON public.shop_content_pages (updated_at DESC);

CREATE OR REPLACE FUNCTION public.touch_shop_content_pages_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  IF NEW.is_published = true AND OLD.is_published IS DISTINCT FROM NEW.is_published AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_touch_shop_content_pages_updated_at ON public.shop_content_pages;
CREATE TRIGGER trg_touch_shop_content_pages_updated_at
  BEFORE UPDATE ON public.shop_content_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_shop_content_pages_updated_at();

ALTER TABLE public.shop_content_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_content_pages_public_read_published" ON public.shop_content_pages;
CREATE POLICY "shop_content_pages_public_read_published"
  ON public.shop_content_pages
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS "shop_content_pages_admin_manage" ON public.shop_content_pages;
CREATE POLICY "shop_content_pages_admin_manage"
  ON public.shop_content_pages
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

GRANT SELECT ON public.shop_content_pages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shop_content_pages TO authenticated;
GRANT ALL ON public.shop_content_pages TO service_role;

INSERT INTO public.shop_content_pages (
  section_type,
  title,
  slug,
  summary,
  sort_order,
  is_published,
  content_json
)
VALUES
  ('wholesale', '批發專區說明', 'wholesale-intro', '批發制度、VIP 批發權益與大量採購說明。', 10, false, '{}'::jsonb),
  ('patent', '專利檢驗資料', 'patent-certifications', '產品專利、檢驗報告與認證資料彙整。', 20, false, '{}'::jsonb),
  ('news', '最新消息', 'brand-news', '品牌公告、活動資訊與優惠消息。', 30, false, '{}'::jsonb),
  ('health', '健康學術文章', 'health-research', '健康研究、營養知識與產品應用文獻。', 40, false, '{}'::jsonb)
ON CONFLICT (section_type, slug) DO NOTHING;
