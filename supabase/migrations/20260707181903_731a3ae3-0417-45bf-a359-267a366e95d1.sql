
-- 1) dealer_metrics: remove sales from SELECT
DROP POLICY IF EXISTS "Users view own metrics" ON public.dealer_metrics;
CREATE POLICY "Users view own metrics" ON public.dealer_metrics
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  );

-- 2) product_wholesale_tiers: include super_admin on write policies
DROP POLICY IF EXISTS "Admins manage wholesale tiers (insert)" ON public.product_wholesale_tiers;
DROP POLICY IF EXISTS "Admins manage wholesale tiers (update)" ON public.product_wholesale_tiers;
DROP POLICY IF EXISTS "Admins manage wholesale tiers (delete)" ON public.product_wholesale_tiers;

CREATE POLICY "Admins manage wholesale tiers (insert)" ON public.product_wholesale_tiers
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admins manage wholesale tiers (update)" ON public.product_wholesale_tiers
  FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admins manage wholesale tiers (delete)" ON public.product_wholesale_tiers
  FOR DELETE TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

-- 3) Avatars storage: enforce strict UUID folder equal to auth.uid()
DROP POLICY IF EXISTS "Avatars self upload" ON storage.objects;
DROP POLICY IF EXISTS "Avatars self update" ON storage.objects;
DROP POLICY IF EXISTS "Avatars self delete" ON storage.objects;

CREATE POLICY "Avatars self upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND ((storage.foldername(name))[1])::uuid = auth.uid()
  );

CREATE POLICY "Avatars self update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND ((storage.foldername(name))[1])::uuid = auth.uid()
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND ((storage.foldername(name))[1])::uuid = auth.uid()
  );

CREATE POLICY "Avatars self delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND ((storage.foldername(name))[1])::uuid = auth.uid()
  );
