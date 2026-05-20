
DO $$
DECLARE
  v_company_id uuid;
  t text;
  tables text[] := ARRAY[
    'b2b_orders','b2b_order_items','business_accounts','sales_representatives',
    'categories','product_images','price_tiers','moq_rules',
    'coupons','dealers','vendors','orders'
  ];
BEGIN
  SELECT id INTO v_company_id FROM public.companies
    WHERE status='active' ORDER BY created_at LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION '找不到任何 active 公司，無法回填';
  END IF;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT', t);
    EXECUTE format('UPDATE public.%I SET company_id = %L WHERE company_id IS NULL', t, v_company_id);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET DEFAULT private.current_company_id()', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_company ON public.%I(company_id)', t, t);

    EXECUTE format('DROP POLICY IF EXISTS tenant_scope ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_scope ON public.%I
      AS RESTRICTIVE
      FOR ALL TO authenticated
      USING (
        private.has_role(auth.uid(), 'super_admin'::app_role)
        OR company_id = private.current_company_id()
      )
      WITH CHECK (
        private.has_role(auth.uid(), 'super_admin'::app_role)
        OR company_id = private.current_company_id()
      )
    $f$, t);
  END LOOP;
END $$;
