-- Add RESTRICTIVE tenant_scope policies to group_buys and group_buy_settings.
-- Ensures staff can only access rows for their current company; super_admin bypass.

-- group_buys: tenant_scope restrictive policy
DROP POLICY IF EXISTS "group_buys_tenant_scope" ON public.group_buys;
CREATE POLICY "group_buys_tenant_scope"
ON public.group_buys
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id = private.current_company_id()
  OR status = 'open'  -- allow public-open read policy to still function
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id = private.current_company_id()
);

-- group_buy_settings: tenant_scope restrictive policy
DROP POLICY IF EXISTS "group_buy_settings_tenant_scope" ON public.group_buy_settings;
CREATE POLICY "group_buy_settings_tenant_scope"
ON public.group_buy_settings
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id = private.current_company_id()
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id = private.current_company_id()
);
