
-- 1) annual_fee_upgrade_logs: drop sales from broad read
DROP POLICY IF EXISTS "annual_fee_logs_admin_read" ON public.annual_fee_upgrade_logs;
CREATE POLICY "annual_fee_logs_admin_read"
  ON public.annual_fee_upgrade_logs
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR user_id = auth.uid()
  );

-- 2) service-only email tables: switch role target from public to service_role
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "Service role can insert send log" ON public.email_send_log
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can read send log" ON public.email_send_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role can update send log" ON public.email_send_log
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "Service role can manage send state" ON public.email_send_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can insert tokens" ON public.email_unsubscribe_tokens
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can mark tokens as used" ON public.email_unsubscribe_tokens
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can read tokens" ON public.email_unsubscribe_tokens
  FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role can insert suppressed emails" ON public.suppressed_emails
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can read suppressed emails" ON public.suppressed_emails
  FOR SELECT TO service_role USING (true);

-- 3) storage.objects: scope product-images per company folder
DROP POLICY IF EXISTS "Product images staff list" ON storage.objects;
DROP POLICY IF EXISTS "Staff upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Staff update product images" ON storage.objects;
DROP POLICY IF EXISTS "Staff delete product images" ON storage.objects;

CREATE POLICY "Product images staff list"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      private.has_role(auth.uid(), 'super_admin'::app_role)
      OR (
        (storage.foldername(name))[1] IS NOT NULL
        AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND (
          private.has_role(auth.uid(), 'admin'::app_role)
          OR private.has_role(auth.uid(), 'sales'::app_role)
          OR private.has_role(auth.uid(), 'warehouse'::app_role)
        )
        AND private.is_company_member(
          ((storage.foldername(name))[1])::uuid,
          auth.uid()
        )
      )
    )
  );

CREATE POLICY "Staff upload product images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (
      private.has_role(auth.uid(), 'super_admin'::app_role)
      OR (
        (storage.foldername(name))[1] IS NOT NULL
        AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND (
          private.has_role(auth.uid(), 'admin'::app_role)
          OR private.has_role(auth.uid(), 'sales'::app_role)
          OR private.has_role(auth.uid(), 'warehouse'::app_role)
        )
        AND private.is_company_member(
          ((storage.foldername(name))[1])::uuid,
          auth.uid()
        )
      )
    )
  );

CREATE POLICY "Staff update product images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      private.has_role(auth.uid(), 'super_admin'::app_role)
      OR owner = auth.uid()
      OR (
        (storage.foldername(name))[1] IS NOT NULL
        AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND private.has_role(auth.uid(), 'admin'::app_role)
        AND private.is_company_member(
          ((storage.foldername(name))[1])::uuid,
          auth.uid()
        )
      )
    )
  );

CREATE POLICY "Staff delete product images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      private.has_role(auth.uid(), 'super_admin'::app_role)
      OR owner = auth.uid()
      OR (
        (storage.foldername(name))[1] IS NOT NULL
        AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND private.has_role(auth.uid(), 'admin'::app_role)
        AND private.is_company_member(
          ((storage.foldername(name))[1])::uuid,
          auth.uid()
        )
      )
    )
  );
