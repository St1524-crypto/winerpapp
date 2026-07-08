
CREATE POLICY "branding_pending_owner_all"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'branding-pending'
    AND (storage.foldername(name))[1] = 'pending'
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'branding-pending'
    AND (storage.foldername(name))[1] = 'pending'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "branding_pending_admin_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'branding-pending'
    AND (
      private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'super_admin'::app_role)
    )
  );
