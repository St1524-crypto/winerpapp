
-- 1) branding-pending admin read: scope to admins of the same company as the uploader.
DROP POLICY IF EXISTS "branding_pending_admin_read" ON storage.objects;
CREATE POLICY "branding_pending_admin_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'branding-pending'
    AND (storage.foldername(name))[1] = 'pending'
    AND (
      private.has_role(auth.uid(), 'super_admin'::app_role)
      OR (
        private.has_role(auth.uid(), 'admin'::app_role)
        AND EXISTS (
          SELECT 1
          FROM public.company_members cm_admin
          JOIN public.company_members cm_owner
            ON cm_admin.company_id = cm_owner.company_id
          WHERE cm_admin.user_id = auth.uid()
            AND cm_admin.company_id = private.current_company_id()
            AND cm_owner.user_id::text = (storage.foldername(name))[2]
        )
      )
    )
  );

-- 2) shop_content_questions: restrict public read audience to anon only.
--    Authenticated users must use owner_read (own rows) or admin_all (admins).
--    The storefront UI queries via a server function using the anon key, so
--    published-page visibility is unaffected.
DROP POLICY IF EXISTS "questions_public_read" ON public.shop_content_questions;
CREATE POLICY "questions_public_read"
  ON public.shop_content_questions
  FOR SELECT
  TO anon
  USING (
    is_hidden = false
    AND EXISTS (
      SELECT 1 FROM public.shop_content_pages p
      WHERE p.id = shop_content_questions.page_id
        AND p.is_published = true
    )
  );
