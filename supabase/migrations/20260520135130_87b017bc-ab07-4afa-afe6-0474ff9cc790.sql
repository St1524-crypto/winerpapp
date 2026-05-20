-- companies: allow admin to manage and view
DROP POLICY IF EXISTS "Admin manage companies" ON public.companies;
CREATE POLICY "Admin manage companies"
ON public.companies FOR ALL TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Auth view active companies" ON public.companies;
CREATE POLICY "Auth view active companies"
ON public.companies FOR SELECT TO authenticated
USING (
  status = 'active'
  OR private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
);

-- company_members: allow admin to manage too
DROP POLICY IF EXISTS "Admin manage company_members" ON public.company_members;
CREATE POLICY "Admin manage company_members"
ON public.company_members FOR ALL TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
);