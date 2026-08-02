DROP POLICY IF EXISTS "branding_pending_admin_review_read" ON storage.objects;
CREATE POLICY "branding_pending_admin_review_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'branding-pending'
  AND (storage.foldername(name))[1] = 'pending'
  AND (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  )
);