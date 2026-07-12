
-- 1. Remove client-side INSERT capability on audit_logs.
DROP POLICY IF EXISTS "Authenticated insert audit logs" ON public.audit_logs;

-- Defense-in-depth: any future client-role INSERT (e.g. via a mistaken policy)
-- will still be rejected unless it runs as service_role or postgres.
CREATE OR REPLACE FUNCTION public.audit_logs_reject_client_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role'
     OR session_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_logs may only be written by server-side code'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_reject_client_insert ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_reject_client_insert
BEFORE INSERT ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.audit_logs_reject_client_insert();

-- 2. Fix the broken vendor branch on purchase_orders.
-- purchase_orders.vendor_id references vendors.id, not auth.uid(), so the
-- previous check was structurally wrong. Drop it and keep staff-only access.
DROP POLICY IF EXISTS "Warehouse view purchases" ON public.purchase_orders;

CREATE POLICY "Warehouse view purchases"
  ON public.purchase_orders
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  );
