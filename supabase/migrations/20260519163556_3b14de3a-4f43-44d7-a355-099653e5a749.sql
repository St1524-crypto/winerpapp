-- Add company_id to inventory_transactions for tenant isolation
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- Backfill to default company (first company created during stage 1)
UPDATE public.inventory_transactions
SET company_id = (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
WHERE company_id IS NULL;

ALTER TABLE public.inventory_transactions
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_company_id
  ON public.inventory_transactions(company_id);

-- Restrictive tenant scope policy
DROP POLICY IF EXISTS tenant_scope ON public.inventory_transactions;
CREATE POLICY tenant_scope ON public.inventory_transactions
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