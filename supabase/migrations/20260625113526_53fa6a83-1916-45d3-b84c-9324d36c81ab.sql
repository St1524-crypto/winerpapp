
DROP TRIGGER IF EXISTS trg_profiles_block_sensitive_self_update ON public.profiles;
CREATE TRIGGER trg_profiles_block_sensitive_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_block_sensitive_self_update();

DROP POLICY IF EXISTS "Admins view login attempts" ON public.login_attempts;
CREATE POLICY "Admins view login attempts"
ON public.login_attempts FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Members view active vip upgrade rules" ON public.annual_fee_vip_rules;
CREATE POLICY "Members view active vip upgrade rules"
ON public.annual_fee_vip_rules FOR SELECT
TO authenticated
USING (is_active = true AND show_on_vip_upgrade_page = true);

DROP POLICY IF EXISTS "qi sales read own" ON public.quote_items;
CREATE POLICY "qi sales read own"
ON public.quote_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
      AND q.created_by = auth.uid()
  )
);
