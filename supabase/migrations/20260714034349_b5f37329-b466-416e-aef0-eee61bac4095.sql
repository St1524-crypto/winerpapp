
-- 1) Drop the global super_admin cross-tenant read on branding-pending drafts.
-- Owners still have full access via branding_pending_owner_all; server-side
-- signed URL generation in the upload function uses the service role client,
-- which bypasses RLS, so admin previews continue to work without this policy.
DROP POLICY IF EXISTS "branding_pending_admin_read" ON storage.objects;

-- 2) Tighten authenticated cross-tenant reads of open group buys.
-- Storefront anon browsing still works via "gb public read open".
-- Authenticated users now only see open group buys within their own company
-- (or super_admin), matching the tenant isolation model.
DROP POLICY IF EXISTS "group_buys_tenant_scope" ON public.group_buys;
CREATE POLICY "group_buys_tenant_scope"
ON public.group_buys
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
