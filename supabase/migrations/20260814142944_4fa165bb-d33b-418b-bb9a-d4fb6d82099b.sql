-- 1) shop_content_questions: restrict cross-tenant/global reads
DROP POLICY IF EXISTS "questions scope restrictive" ON public.shop_content_questions;
CREATE POLICY "questions scope restrictive"
ON public.shop_content_questions
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

REVOKE ALL ON public.shop_content_questions FROM anon;

-- 2) cooperation_applications: applicant PII is service-role write only
REVOKE ALL ON public.cooperation_applications FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.cooperation_applications FROM authenticated;
GRANT SELECT, UPDATE ON public.cooperation_applications TO authenticated;
GRANT ALL ON public.cooperation_applications TO service_role;

-- 3) member_featured_products: close frozen/inactive exposure window by
-- unpublishing storefront pages as soon as the profile is frozen/inactive
CREATE OR REPLACE FUNCTION public.unpublish_storefront_when_member_inactive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.frozen_code IS NOT NULL AND NEW.frozen_code <> 'N')
     OR (NEW.member_status IS NOT NULL
         AND NEW.member_status NOT IN ('active', '正式會員')) THEN
    UPDATE public.member_storefront_pages
       SET published_at = NULL
     WHERE member_id = NEW.id
       AND published_at IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unpublish_storefront_when_member_inactive ON public.profiles;
CREATE TRIGGER trg_unpublish_storefront_when_member_inactive
AFTER UPDATE OF frozen_code, member_status ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.unpublish_storefront_when_member_inactive();

CREATE INDEX IF NOT EXISTS idx_member_storefront_pages_member_published
  ON public.member_storefront_pages (member_id, published_at);
