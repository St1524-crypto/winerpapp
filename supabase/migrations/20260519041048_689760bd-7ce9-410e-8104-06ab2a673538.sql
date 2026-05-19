
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read branding" ON storage.objects;
CREATE POLICY "Public read branding" ON storage.objects
  FOR SELECT USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Admins upload branding" ON storage.objects;
CREATE POLICY "Admins upload branding" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS "Admins update branding" ON storage.objects;
CREATE POLICY "Admins update branding" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS "Admins delete branding" ON storage.objects;
CREATE POLICY "Admins delete branding" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND public.has_role(auth.uid(),'super_admin'));
