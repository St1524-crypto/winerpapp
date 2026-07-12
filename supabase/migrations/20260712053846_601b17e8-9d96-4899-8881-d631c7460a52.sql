
-- Restrict INSERT on public.companies to the single authorized creator email.
CREATE OR REPLACE FUNCTION private.is_authorized_company_creator(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = _uid
      AND lower(u.email) = lower('admin-test@winerp.app')
  )
  AND private.has_role(_uid, 'super_admin'::app_role);
$$;

REVOKE ALL ON FUNCTION private.is_authorized_company_creator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_authorized_company_creator(uuid) TO authenticated, service_role;

-- Split the broad "Admin manage companies" FOR ALL policy into
-- non-INSERT commands for admins, and a stricter INSERT policy that
-- requires the authorized creator identity.
DROP POLICY IF EXISTS "Admin manage companies" ON public.companies;

CREATE POLICY "Admin update companies"
ON public.companies FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admin delete companies"
ON public.companies FOR DELETE TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Authorized creator inserts companies"
ON public.companies FOR INSERT TO authenticated
WITH CHECK (private.is_authorized_company_creator(auth.uid()));
