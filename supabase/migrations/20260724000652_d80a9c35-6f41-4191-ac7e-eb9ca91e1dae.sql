
-- Tighten business_accounts permissive policies with explicit tenant scope
DROP POLICY IF EXISTS "Admin sales manage ba" ON public.business_accounts;
DROP POLICY IF EXISTS "Admin sales view ba" ON public.business_accounts;

CREATE POLICY "Admin sales manage ba"
  ON public.business_accounts
  FOR ALL
  TO authenticated
  USING (
    (
      private.has_role(auth.uid(), 'super_admin'::app_role)
      OR (
        (private.has_role(auth.uid(), 'sales'::app_role))
        AND company_id IS NOT NULL
        AND company_id = private.current_company_id()
      )
    )
  )
  WITH CHECK (
    (
      private.has_role(auth.uid(), 'super_admin'::app_role)
      OR (
        (private.has_role(auth.uid(), 'sales'::app_role))
        AND company_id IS NOT NULL
        AND company_id = private.current_company_id()
      )
    )
  );

CREATE POLICY "Admin sales view ba"
  ON public.business_accounts
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      (
        private.has_role(auth.uid(), 'sales'::app_role)
        OR private.has_role(auth.uid(), 'finance'::app_role)
      )
      AND company_id IS NOT NULL
      AND company_id = private.current_company_id()
    )
    OR private.is_account_member(id, auth.uid())
  );

-- Add company_id to dealer_tier_history so staff reads scope strictly per-tenant
ALTER TABLE public.dealer_tier_history
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dealer_tier_history_company_id_idx
  ON public.dealer_tier_history(company_id);

-- Backfill company_id from the dealer_tier_status row's implied current_company (via profiles.current_company_id if present)
UPDATE public.dealer_tier_history dth
SET company_id = p.current_company_id
FROM public.profiles p
WHERE dth.company_id IS NULL
  AND p.id = dth.user_id
  AND p.current_company_id IS NOT NULL;

-- Replace cross-company-members restrictive policy with strict company_id match
DROP POLICY IF EXISTS "dth tenant_scope restrictive" ON public.dealer_tier_history;

CREATE POLICY "dth tenant_scope restrictive"
  ON public.dealer_tier_history
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR auth.uid() = user_id
    OR (
      (
        private.has_role(auth.uid(), 'admin'::app_role)
        OR private.has_role(auth.uid(), 'finance'::app_role)
        OR private.has_role(auth.uid(), 'sales'::app_role)
      )
      AND company_id IS NOT NULL
      AND company_id = private.current_company_id()
    )
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR auth.uid() = user_id
    OR (
      (
        private.has_role(auth.uid(), 'admin'::app_role)
        OR private.has_role(auth.uid(), 'finance'::app_role)
        OR private.has_role(auth.uid(), 'sales'::app_role)
      )
      AND company_id IS NOT NULL
      AND company_id = private.current_company_id()
    )
  );
