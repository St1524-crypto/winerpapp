
-- Drop broad public policy on shop_content_pages that exposed all columns (incl. created_by/updated_by) to anon
DROP POLICY IF EXISTS "Public can read published shop content" ON public.shop_content_pages;

-- Public-facing view exposing only safe, non-internal columns for published content
CREATE OR REPLACE VIEW public.shop_content_public_pages
WITH (security_invoker = true) AS
SELECT
  id,
  section_type,
  title,
  slug,
  summary,
  cover_image,
  images,
  content_json,
  content_html,
  external_url,
  sort_order,
  is_published,
  published_at,
  updated_at
FROM public.shop_content_pages
WHERE is_published = true;

-- Grant read-only access on the curated view
GRANT SELECT ON public.shop_content_public_pages TO anon, authenticated;

-- Re-enable admin/auth reads on base table are unchanged; add a narrow SELECT
-- policy so the view (running as invoker) can read the underlying rows for
-- anon and authenticated users, but only published rows.
CREATE POLICY "Public can read published rows (via view)"
ON public.shop_content_pages
FOR SELECT
TO anon, authenticated
USING (is_published = true);

COMMENT ON VIEW public.shop_content_public_pages IS
  'Public-safe projection of shop_content_pages. Excludes internal author fields (created_by/updated_by). Server functions and clients should query this view for public listings.';
