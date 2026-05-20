-- Recreate branding storage policies using inline EXISTS to avoid any function-permission edge case
DROP POLICY IF EXISTS "Admins upload branding" ON storage.objects;
DROP POLICY IF EXISTS "Admins update branding" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete branding" ON storage.objects;

CREATE POLICY "Admins upload branding"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'branding'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin'::app_role, 'admin'::app_role)
  )
);

CREATE POLICY "Admins update branding"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'branding'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin'::app_role, 'admin'::app_role)
  )
);

CREATE POLICY "Admins delete branding"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'branding'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin'::app_role, 'admin'::app_role)
  )
);