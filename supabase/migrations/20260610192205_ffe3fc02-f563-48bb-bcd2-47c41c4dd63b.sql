-- Convert tenant_scope from PERMISSIVE to RESTRICTIVE so company isolation
-- is enforced via AND across all other role-based policies. This prevents
-- staff roles (sales/finance/warehouse/admin) from seeing other companies' data.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'account_statements','accounts_payable','accounts_receivable',
    'b2b_order_items','b2b_orders','bank_accounts','business_accounts',
    'categories','coupons','customers','dealers','finance_transactions',
    'goods_receiving','inventory_logs','inventory_transactions','invoices',
    'moq_rules','orders','payments','price_tiers','product_images','products',
    'purchase_order_items','purchase_orders','sales_order_items','sales_orders',
    'sales_representatives','shipments','vendors','warehouse_inventory',
    'warehouses','webhook_endpoints'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_scope ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_scope ON public.%I
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
          OR company_id IS NULL
          OR company_id = private.current_company_id()
        )
    $f$, t);
  END LOOP;
END $$;