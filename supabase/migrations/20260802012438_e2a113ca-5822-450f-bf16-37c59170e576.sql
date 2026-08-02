-- 1) Backfill NULL company_id
UPDATE public.bonus_records b
SET company_id = COALESCE(
  (SELECT s.company_id FROM public.sales_orders s WHERE s.id = b.source_order_id),
  'ded70bbc-f96a-48f7-aaa5-f0b0bfb88f85'::uuid)
WHERE b.company_id IS NULL;

UPDATE public.annual_fee_upgrade_logs SET company_id = 'ded70bbc-f96a-48f7-aaa5-f0b0bfb88f85'::uuid WHERE company_id IS NULL;
UPDATE public.vip_upgrade_orders SET company_id = 'ded70bbc-f96a-48f7-aaa5-f0b0bfb88f85'::uuid WHERE company_id IS NULL;
UPDATE public.homepage_sections SET company_id = 'ded70bbc-f96a-48f7-aaa5-f0b0bfb88f85'::uuid WHERE company_id IS NULL;
UPDATE public.homepage_section_products SET company_id = 'ded70bbc-f96a-48f7-aaa5-f0b0bfb88f85'::uuid WHERE company_id IS NULL;
UPDATE public.homepage_featured_products SET company_id = 'ded70bbc-f96a-48f7-aaa5-f0b0bfb88f85'::uuid WHERE company_id IS NULL;
UPDATE public.annual_fee_vip_rules SET company_id = 'ded70bbc-f96a-48f7-aaa5-f0b0bfb88f85'::uuid WHERE company_id IS NULL;

-- 2) Rebuild every tenant_scope RESTRICTIVE policy without the "company_id IS NULL" bypass
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.tablename, p.policyname
    FROM pg_policies p
    JOIN information_schema.columns c
      ON c.table_schema = 'public' AND c.table_name = p.tablename AND c.column_name = 'company_id'
    WHERE p.schemaname = 'public'
      AND p.permissive = 'RESTRICTIVE'
      AND p.policyname ILIKE '%tenant_scope%'
      AND (p.qual ILIKE '%company_id IS NULL%' OR COALESCE(p.with_check,'') ILIKE '%company_id IS NULL%')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (
        private.has_role(auth.uid(), 'super_admin'::app_role)
        OR (company_id IS NOT NULL AND company_id = private.current_company_id())
      )
      WITH CHECK (
        private.has_role(auth.uid(), 'super_admin'::app_role)
        OR (company_id IS NOT NULL AND company_id = private.current_company_id())
      )$f$, r.policyname, r.tablename);
  END LOOP;
END $$;

-- 3) shop_content_questions: hide author_name from ordinary authenticated readers
REVOKE SELECT ON public.shop_content_questions FROM authenticated;
GRANT SELECT (id, page_id, user_id, content, reply, replied_by, replied_at, is_hidden, created_at)
  ON public.shop_content_questions TO authenticated;
GRANT SELECT ON public.shop_content_questions TO service_role;
