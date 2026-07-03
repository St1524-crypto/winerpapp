ALTER TABLE public.shop_content_pages DROP CONSTRAINT IF EXISTS shop_content_pages_section_type_check;
ALTER TABLE public.shop_content_pages ADD CONSTRAINT shop_content_pages_section_type_check
  CHECK (section_type = ANY (ARRAY['wholesale'::text, 'patent'::text, 'news'::text, 'health'::text, 'academy'::text]));