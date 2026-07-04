
-- ai_logs: restrict INSERT to staff roles + bind created_by to caller
DROP POLICY IF EXISTS "Authenticated insert ai_logs" ON public.ai_logs;
CREATE POLICY "Staff insert ai_logs" ON public.ai_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    (created_by IS NULL OR created_by = auth.uid())
    AND (
      private.has_role(auth.uid(), 'super_admin'::app_role)
      OR private.has_role(auth.uid(), 'finance'::app_role)
      OR private.has_role(auth.uid(), 'sales'::app_role)
    )
  );

-- moq_rules: require staff role for SELECT (plus existing tenant_scope restrictive)
DROP POLICY IF EXISTS "Auth view moq" ON public.moq_rules;
CREATE POLICY "Staff view moq" ON public.moq_rules
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
  );

-- quotes: prevent sales reps from reassigning ownership on UPDATE
DROP POLICY IF EXISTS "quotes sales update own non-converted" ON public.quotes;
CREATE POLICY "quotes sales update own non-converted" ON public.quotes
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'sales'::app_role)
    AND created_by = auth.uid()
    AND status <> 'converted'::text
  )
  WITH CHECK (
    has_role(auth.uid(), 'sales'::app_role)
    AND created_by = auth.uid()
    AND status <> 'converted'::text
  );
