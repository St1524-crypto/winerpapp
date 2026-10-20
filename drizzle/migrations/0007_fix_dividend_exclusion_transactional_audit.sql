CREATE OR REPLACE FUNCTION public.audit_logs_reject_client_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Evaluate the effective caller before entering this trigger. Trusted
  -- SECURITY DEFINER business functions run as their privileged owner;
  -- direct Data API inserts remain authenticated/anon and are rejected.
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_logs may only be written by server-side code'
    USING ERRCODE = '42501';
END;
$$;
COMMENT ON FUNCTION public.audit_logs_reject_client_insert() IS
'Invoker-security audit guard: permits trusted server roles and privileged business functions while rejecting direct client inserts. Do not change to SECURITY DEFINER: that hides the effective calling role.';