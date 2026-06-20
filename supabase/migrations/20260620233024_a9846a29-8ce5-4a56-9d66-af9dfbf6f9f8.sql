-- 1. Remove unused anon "Public storefront read" policy on profiles.
--    Anon role has no GRANT on the table, so this policy is dead but still
--    flagged by scanners as exposing PII. Storefront uses server-side admin client.
DROP POLICY IF EXISTS "Public storefront read" ON public.profiles;

-- 2. Harden webhook_endpoints: revoke anon (no policy uses it) and make
--    tenant_scope a RESTRICTIVE filter rather than an OR'd permissive policy,
--    so company members without admin role cannot read bearer_token.
REVOKE ALL ON public.webhook_endpoints FROM anon;

DROP POLICY IF EXISTS "tenant_scope" ON public.webhook_endpoints;

CREATE POLICY "tenant_scope_restrictive"
ON public.webhook_endpoints
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id IS NULL
  OR company_id = private.current_company_id()
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR company_id IS NULL
  OR company_id = private.current_company_id()
);