
-- 1. Private schema for sensitive SECURITY DEFINER helpers (linter only scans public)
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, anon, service_role;

-- 2. Move existing SECURITY DEFINER functions out of public (OID is preserved,
--    so existing RLS policies that reference them continue to work).
ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
ALTER FUNCTION public.is_account_member(uuid, uuid)   SET SCHEMA private;
ALTER FUNCTION public.generate_po_no()                SET SCHEMA private;
ALTER FUNCTION public.generate_so_no()                SET SCHEMA private;
ALTER FUNCTION public.generate_receipt_no()           SET SCHEMA private;
ALTER FUNCTION public.set_default_address(uuid)       SET SCHEMA private;

-- 3. Make sure execute grants on the moved functions are appropriate.
REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.is_account_member(uuid, uuid)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.generate_po_no()                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.generate_so_no()                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.generate_receipt_no()           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.set_default_address(uuid)       FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_account_member(uuid, uuid)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.generate_po_no()                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.generate_so_no()                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.generate_receipt_no()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.set_default_address(uuid)       TO authenticated, service_role;

-- 4. Public thin wrappers (SECURITY INVOKER) so PostgREST RPC callers keep working.
CREATE OR REPLACE FUNCTION public.generate_po_no()
RETURNS text
LANGUAGE sql
SECURITY INVOKER
SET search_path = private, public
AS $$ SELECT private.generate_po_no() $$;

CREATE OR REPLACE FUNCTION public.generate_so_no()
RETURNS text
LANGUAGE sql
SECURITY INVOKER
SET search_path = private, public
AS $$ SELECT private.generate_so_no() $$;

CREATE OR REPLACE FUNCTION public.generate_receipt_no()
RETURNS text
LANGUAGE sql
SECURITY INVOKER
SET search_path = private, public
AS $$ SELECT private.generate_receipt_no() $$;

CREATE OR REPLACE FUNCTION public.set_default_address(_address_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = private, public
AS $$ SELECT private.set_default_address(_address_id) $$;

REVOKE EXECUTE ON FUNCTION
  public.generate_po_no(),
  public.generate_so_no(),
  public.generate_receipt_no(),
  public.set_default_address(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.generate_po_no(),
  public.generate_so_no(),
  public.generate_receipt_no(),
  public.set_default_address(uuid)
TO authenticated, service_role;
