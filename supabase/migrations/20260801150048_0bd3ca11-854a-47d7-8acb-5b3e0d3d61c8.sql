-- 1) annual_fee_upgrade_logs
ALTER TABLE public.annual_fee_upgrade_logs
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

UPDATE public.annual_fee_upgrade_logs l
   SET company_id = COALESCE(p.current_company_id, cm.company_id)
  FROM public.profiles p
  LEFT JOIN public.company_members cm ON cm.user_id = p.id
 WHERE l.company_id IS NULL AND p.id = l.user_id;

CREATE INDEX IF NOT EXISTS idx_annual_fee_upgrade_logs_company_id
  ON public.annual_fee_upgrade_logs(company_id);

DROP POLICY IF EXISTS tenant_scope ON public.annual_fee_upgrade_logs;
CREATE POLICY tenant_scope ON public.annual_fee_upgrade_logs
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

-- 2) dealer_metrics
ALTER TABLE public.dealer_metrics
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

UPDATE public.dealer_metrics m
   SET company_id = COALESCE(p.current_company_id, cm.company_id)
  FROM public.profiles p
  LEFT JOIN public.company_members cm ON cm.user_id = p.id
 WHERE m.company_id IS NULL AND p.id = m.user_id;

CREATE INDEX IF NOT EXISTS idx_dealer_metrics_company_id
  ON public.dealer_metrics(company_id);

DROP POLICY IF EXISTS tenant_scope ON public.dealer_metrics;
CREATE POLICY tenant_scope ON public.dealer_metrics
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

-- 3) national_bonus_pool_ledger
ALTER TABLE public.national_bonus_pool_ledger
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

UPDATE public.national_bonus_pool_ledger n
   SET company_id = COALESCE(p.current_company_id, cm.company_id)
  FROM public.profiles p
  LEFT JOIN public.company_members cm ON cm.user_id = p.id
 WHERE n.company_id IS NULL AND p.id = n.member_id;

CREATE INDEX IF NOT EXISTS idx_national_bonus_pool_ledger_company_id
  ON public.national_bonus_pool_ledger(company_id);

DROP POLICY IF EXISTS tenant_scope ON public.national_bonus_pool_ledger;
CREATE POLICY tenant_scope ON public.national_bonus_pool_ledger
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