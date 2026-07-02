
CREATE TABLE public.shop_content_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_type text NOT NULL CHECK (section_type IN ('wholesale','patent','news','health')),
  title text NOT NULL,
  slug text NOT NULL,
  summary text,
  cover_image text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_html text,
  external_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_type, slug)
);

GRANT SELECT ON public.shop_content_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_content_pages TO authenticated;
GRANT ALL ON public.shop_content_pages TO service_role;

ALTER TABLE public.shop_content_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published shop content"
  ON public.shop_content_pages FOR SELECT
  USING (is_published = true);

CREATE POLICY "Admins can read all shop content"
  ON public.shop_content_pages FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can insert shop content"
  ON public.shop_content_pages FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can update shop content"
  ON public.shop_content_pages FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can delete shop content"
  ON public.shop_content_pages FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

CREATE INDEX shop_content_pages_section_idx ON public.shop_content_pages(section_type, sort_order, published_at DESC);

CREATE TRIGGER shop_content_pages_touch_updated
  BEFORE UPDATE ON public.shop_content_pages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
