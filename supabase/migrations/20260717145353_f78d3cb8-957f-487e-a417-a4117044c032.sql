DROP POLICY IF EXISTS "Admin view ai_logs" ON public.ai_logs;
CREATE POLICY "Admin view ai_logs" ON public.ai_logs
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  );