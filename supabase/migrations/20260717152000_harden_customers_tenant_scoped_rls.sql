-- Harden customers tenant scoped RLS.
-- Scope: policy-only migration. No schema, data, wallet, order, or UI changes.

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_scope ON public.customers;
CREATE POLICY tenant_scope
  ON public.customers
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

DROP POLICY IF EXISTS "Sales view customers" ON public.customers;
CREATE POLICY "Sales view customers"
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      (
        private.has_role(auth.uid(), 'sales'::app_role)
        OR private.has_role(auth.uid(), 'finance'::app_role)
      )
      AND company_id = private.current_company_id()
    )
  );

DROP POLICY IF EXISTS "Sales manage customers" ON public.customers;
CREATE POLICY "Sales manage customers"
  ON public.customers
  FOR ALL
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      private.has_role(auth.uid(), 'sales'::app_role)
      AND company_id = private.current_company_id()
    )
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      private.has_role(auth.uid(), 'sales'::app_role)
      AND company_id = private.current_company_id()
    )
  );

DO $$
DECLARE
  _tenant_qual text;
  _tenant_check text;
  _view_qual text;
  _manage_qual text;
  _manage_check text;
BEGIN
  SELECT qual, with_check
    INTO _tenant_qual, _tenant_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'customers'
    AND policyname = 'tenant_scope';

  IF _tenant_qual IS NULL THEN
    RAISE EXCEPTION 'Verification failed: tenant_scope policy is missing';
  END IF;

  IF lower(COALESCE(_tenant_qual, '') || ' ' || COALESCE(_tenant_check, '')) LIKE '%company_id is null%' THEN
    RAISE EXCEPTION 'Verification failed: tenant_scope still allows company_id IS NULL';
  END IF;

  IF lower(COALESCE(_tenant_qual, '') || ' ' || COALESCE(_tenant_check, '')) NOT LIKE '%company_id = private.current_company_id()%'
     AND lower(COALESCE(_tenant_qual, '') || ' ' || COALESCE(_tenant_check, '')) NOT LIKE '%company_id = current_company_id()%' THEN
    RAISE EXCEPTION 'Verification failed: tenant_scope does not enforce current company';
  END IF;

  SELECT qual
    INTO _view_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'customers'
    AND policyname = 'Sales view customers';

  IF lower(COALESCE(_view_qual, '')) NOT LIKE '%company_id = private.current_company_id()%'
     AND lower(COALESCE(_view_qual, '')) NOT LIKE '%company_id = current_company_id()%' THEN
    RAISE EXCEPTION 'Verification failed: Sales view customers lacks tenant scope';
  END IF;

  SELECT qual, with_check
    INTO _manage_qual, _manage_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'customers'
    AND policyname = 'Sales manage customers';

  IF lower(COALESCE(_manage_qual, '') || ' ' || COALESCE(_manage_check, '')) NOT LIKE '%company_id = private.current_company_id()%'
     AND lower(COALESCE(_manage_qual, '') || ' ' || COALESCE(_manage_check, '')) NOT LIKE '%company_id = current_company_id()%' THEN
    RAISE EXCEPTION 'Verification failed: Sales manage customers lacks tenant scope';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customers'
      AND 'anon' = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'Verification failed: anon has a customers policy';
  END IF;
END $$;
