-- =========================================================
-- Stage 2: Add company_id to core business tables
-- =========================================================
DO $$
DECLARE
  default_company uuid := '7b3d7ba2-2cdd-4f80-bd9d-be444fb29150';
BEGIN
  -- products
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS company_id uuid;
  EXECUTE format('UPDATE public.products SET company_id = %L WHERE company_id IS NULL', default_company);

  -- customers
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS company_id uuid;
  EXECUTE format('UPDATE public.customers SET company_id = %L WHERE company_id IS NULL', default_company);

  -- sales_orders
  ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS company_id uuid;
  EXECUTE format('UPDATE public.sales_orders SET company_id = %L WHERE company_id IS NULL', default_company);

  -- sales_order_items (inherit from sales_orders)
  ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS company_id uuid;
  UPDATE public.sales_order_items soi
     SET company_id = so.company_id
    FROM public.sales_orders so
   WHERE soi.sales_order_id = so.id AND soi.company_id IS NULL;

  -- payments (inherit from sales_orders)
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS company_id uuid;
  UPDATE public.payments p
     SET company_id = so.company_id
    FROM public.sales_orders so
   WHERE p.sales_order_id = so.id AND p.company_id IS NULL;
  EXECUTE format('UPDATE public.payments SET company_id = %L WHERE company_id IS NULL', default_company);

  -- inventory_logs
  ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS company_id uuid;
  EXECUTE format('UPDATE public.inventory_logs SET company_id = %L WHERE company_id IS NULL', default_company);
END $$;

-- NOT NULL + FK + index
ALTER TABLE public.products
  ALTER COLUMN company_id SET NOT NULL,
  ADD CONSTRAINT products_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_products_company ON public.products(company_id);

ALTER TABLE public.customers
  ALTER COLUMN company_id SET NOT NULL,
  ADD CONSTRAINT customers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_customers_company ON public.customers(company_id);

ALTER TABLE public.sales_orders
  ALTER COLUMN company_id SET NOT NULL,
  ADD CONSTRAINT sales_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_sales_orders_company ON public.sales_orders(company_id);

ALTER TABLE public.sales_order_items
  ALTER COLUMN company_id SET NOT NULL,
  ADD CONSTRAINT sales_order_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_sales_order_items_company ON public.sales_order_items(company_id);

ALTER TABLE public.payments
  ALTER COLUMN company_id SET NOT NULL,
  ADD CONSTRAINT payments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_payments_company ON public.payments(company_id);

ALTER TABLE public.inventory_logs
  ALTER COLUMN company_id SET NOT NULL,
  ADD CONSTRAINT inventory_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_inventory_logs_company ON public.inventory_logs(company_id);

-- =========================================================
-- Tenant scope via RESTRICTIVE RLS policy
-- (combines with existing role-based PERMISSIVE policies)
-- =========================================================
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'products','customers','sales_orders','sales_order_items','payments','inventory_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_scope ON public.%I', t);
    EXECUTE format($p$
      CREATE POLICY tenant_scope ON public.%I
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
      )
    $p$, t);
  END LOOP;
END $$;

-- =========================================================
-- Update create_sales_order_with_items to set company_id
-- =========================================================
CREATE OR REPLACE FUNCTION public.create_sales_order_with_items(_order jsonb, _items jsonb, _payments jsonb DEFAULT '[]'::jsonb)
 RETURNS sales_orders
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  new_order public.sales_orders;
  _company_id uuid;
BEGIN
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION '至少需要一項商品明細';
  END IF;

  _company_id := COALESCE(
    NULLIF(_order->>'company_id','')::uuid,
    public.current_company_id()
  );
  IF _company_id IS NULL THEN
    RAISE EXCEPTION '尚未選擇公司，無法建立訂單';
  END IF;

  INSERT INTO public.sales_orders (
    order_no, customer_id, customer_name, customer_email, customer_phone,
    receiver_name, receiver_phone, shipping_address, shipping_method,
    subtotal, shipping_fee, discount_amount, total_amount, notes,
    order_status, shipping_status, payment_status, company_id
  )
  VALUES (
    _order->>'order_no',
    NULLIF(_order->>'customer_id','')::uuid,
    _order->>'customer_name',
    NULLIF(_order->>'customer_email',''),
    NULLIF(_order->>'customer_phone',''),
    _order->>'receiver_name',
    _order->>'receiver_phone',
    _order->>'shipping_address',
    COALESCE(_order->>'shipping_method', 'home_delivery'),
    COALESCE((_order->>'subtotal')::numeric, 0),
    COALESCE((_order->>'shipping_fee')::numeric, 0),
    COALESCE((_order->>'discount_amount')::numeric, 0),
    COALESCE((_order->>'total_amount')::numeric, 0),
    NULLIF(_order->>'notes',''),
    COALESCE(_order->>'order_status', 'pending'),
    COALESCE(_order->>'shipping_status', 'pending'),
    COALESCE(_order->>'payment_status', 'pending'),
    _company_id
  )
  RETURNING * INTO new_order;

  INSERT INTO public.sales_order_items (
    sales_order_id, product_id, product_name, sku, image, unit_price, quantity, subtotal, company_id
  )
  SELECT
    new_order.id,
    NULLIF(item->>'product_id','')::uuid,
    item->>'product_name',
    NULLIF(item->>'sku',''),
    NULLIF(item->>'image',''),
    COALESCE((item->>'unit_price')::numeric, 0),
    COALESCE((item->>'quantity')::int, 1),
    COALESCE((item->>'subtotal')::numeric,
             COALESCE((item->>'unit_price')::numeric,0) * COALESCE((item->>'quantity')::int,1)),
    _company_id
  FROM jsonb_array_elements(_items) AS item;

  IF _payments IS NOT NULL AND jsonb_array_length(_payments) > 0 THEN
    INSERT INTO public.payments (
      sales_order_id, amount, payment_method, payment_status, paid_at, company_id
    )
    SELECT
      new_order.id,
      COALESCE((p->>'amount')::numeric, 0),
      COALESCE(p->>'payment_method', 'bank_transfer'),
      COALESCE(p->>'payment_status', 'pending'),
      NULLIF(p->>'paid_at','')::timestamptz,
      _company_id
    FROM jsonb_array_elements(_payments) AS p
    WHERE COALESCE((p->>'amount')::numeric, 0) > 0;
  END IF;

  RETURN new_order;
END;
$function$;