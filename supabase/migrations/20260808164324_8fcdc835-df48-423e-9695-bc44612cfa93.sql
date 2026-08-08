DROP POLICY IF EXISTS questions_public_read ON public.shop_content_questions;
REVOKE ALL ON public.shop_content_questions FROM anon;
GRANT ALL ON public.shop_content_questions TO service_role;