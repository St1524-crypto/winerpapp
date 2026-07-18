
-- 1. ai_logs: remove sales from INSERT policy
DROP POLICY IF EXISTS "Staff insert ai_logs" ON public.ai_logs;
CREATE POLICY "Staff insert ai_logs" ON public.ai_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    ((created_by IS NULL) OR (created_by = auth.uid()))
    AND (
      private.has_role(auth.uid(), 'super_admin'::app_role)
      OR private.has_role(auth.uid(), 'finance'::app_role)
    )
  );

-- 2. product-images: restrict UPDATE/DELETE to super_admin OR uploader (owner)
DROP POLICY IF EXISTS "Staff update product images" ON storage.objects;
DROP POLICY IF EXISTS "Staff delete product images" ON storage.objects;

CREATE POLICY "Staff update product images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      private.has_role(auth.uid(), 'super_admin'::app_role)
      OR owner = auth.uid()
    )
  );

CREATE POLICY "Staff delete product images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      private.has_role(auth.uid(), 'super_admin'::app_role)
      OR owner = auth.uid()
    )
  );

-- 3. realtime.messages: default-deny for private channels (app only uses postgres_changes)
-- Restrictive policies scoping broadcast/presence to nobody; postgres_changes are unaffected.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='realtime' AND tablename='messages') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Deny broadcast subscribe" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "Deny broadcast send" ON realtime.messages';
    EXECUTE $p$CREATE POLICY "Deny broadcast subscribe" ON realtime.messages FOR SELECT TO authenticated USING (false)$p$;
    EXECUTE $p$CREATE POLICY "Deny broadcast send" ON realtime.messages FOR INSERT TO authenticated WITH CHECK (false)$p$;
  END IF;
END $$;
