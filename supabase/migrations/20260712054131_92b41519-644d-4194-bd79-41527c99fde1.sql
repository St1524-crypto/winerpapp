
-- 1) shop_content_questions: prevent anonymous role from reading author_name column
REVOKE SELECT (author_name) ON public.shop_content_questions FROM anon;

-- 2) quote_items: add RESTRICTIVE tenant-scope policy joining to quotes.company_id
DROP POLICY IF EXISTS "qi tenant_scope restrictive" ON public.quote_items;
CREATE POLICY "qi tenant_scope restrictive"
ON public.quote_items
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
      AND q.company_id = private.current_company_id()
  )
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
      AND q.company_id = private.current_company_id()
  )
);

-- 3) operation_attendance_logs: align WITH CHECK with USING (include manager role)
DROP POLICY IF EXISTS "ops_att_admin_all" ON public.operation_attendance_logs;
CREATE POLICY "ops_att_admin_all"
ON public.operation_attendance_logs
FOR ALL
TO public
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR (public.get_operation_role(auth.uid()) = 'manager'::public.operation_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR (public.get_operation_role(auth.uid()) = 'manager'::public.operation_role)
);
