ALTER TABLE public.bonus_records
  ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT private.current_company_id();
CREATE INDEX IF NOT EXISTS idx_bonus_records_company ON public.bonus_records (company_id);
DROP POLICY IF EXISTS tenant_scope ON public.bonus_records;
CREATE POLICY tenant_scope ON public.bonus_records
  AS RESTRICTIVE FOR ALL TO authenticated
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

ALTER TABLE public.vip_business_bonus_ledger
  ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT private.current_company_id();
CREATE INDEX IF NOT EXISTS idx_vip_business_bonus_ledger_company
  ON public.vip_business_bonus_ledger (company_id);
DROP POLICY IF EXISTS tenant_scope ON public.vip_business_bonus_ledger;
CREATE POLICY tenant_scope ON public.vip_business_bonus_ledger
  AS RESTRICTIVE FOR ALL TO authenticated
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

ALTER TABLE public.vip_upgrade_orders
  ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT private.current_company_id();
CREATE INDEX IF NOT EXISTS idx_vip_upgrade_orders_company
  ON public.vip_upgrade_orders (company_id);
DROP POLICY IF EXISTS tenant_scope ON public.vip_upgrade_orders;
CREATE POLICY tenant_scope ON public.vip_upgrade_orders
  AS RESTRICTIVE FOR ALL TO authenticated
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