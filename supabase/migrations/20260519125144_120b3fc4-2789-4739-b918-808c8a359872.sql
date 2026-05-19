
-- Tighten EXECUTE on SECURITY DEFINER helpers: revoke from PUBLIC/anon, grant only to authenticated
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_account_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_account_member(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.generate_po_no() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_po_no() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.generate_receipt_no() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_receipt_no() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.generate_so_no() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_so_no() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_default_address(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_address(uuid) TO authenticated, service_role;

-- handle_new_user is a trigger fn invoked by auth schema; restrict from clients entirely
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Narrow storage bucket SELECT policies so storage.objects listing is not broadly readable.
-- Public CDN downloads of files in public buckets do not depend on these RLS SELECT policies,
-- so end-users can still view branding / product images by URL.
DROP POLICY IF EXISTS "Public read branding" ON storage.objects;
CREATE POLICY "Authenticated read branding"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
CREATE POLICY "Authenticated read product images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-images');
