
-- 1) quote_bank_accounts: RESTRICTIVE tenant_scope
CREATE POLICY "qba tenant_scope restrictive"
ON public.quote_bank_accounts
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

-- 2) dealer_tier_history: RESTRICTIVE tenant_scope via company_members
CREATE POLICY "dth tenant_scope restrictive"
ON public.dealer_tier_history
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm_viewer
    JOIN public.company_members cm_target
      ON cm_viewer.company_id = cm_target.company_id
    WHERE cm_viewer.user_id = auth.uid()
      AND cm_target.user_id = dealer_tier_history.user_id
      AND cm_viewer.company_id = private.current_company_id()
  )
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR auth.uid() = user_id
);

-- 3) referral_logs: add company_id + backfill + RESTRICTIVE tenant_scope
ALTER TABLE public.referral_logs
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- Backfill from sales_orders / orders when possible
UPDATE public.referral_logs rl
SET company_id = so.company_id
FROM public.sales_orders so
WHERE rl.company_id IS NULL AND rl.order_id = so.id;

UPDATE public.referral_logs rl
SET company_id = o.company_id
FROM public.orders o
WHERE rl.company_id IS NULL AND rl.order_id = o.id;

CREATE INDEX IF NOT EXISTS referral_logs_company_id_idx
  ON public.referral_logs(company_id);

CREATE POLICY "referral_logs tenant_scope restrictive"
ON public.referral_logs
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
  OR company_id = private.current_company_id()
);
