DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.create_sales_order_with_point_payments(jsonb,jsonb,jsonb,jsonb)'::regprocedure);

  d := replace(d,
    'sales_order_id, product_id, product_name, sku, image, unit_price, quantity, subtotal, company_id',
    'sales_order_id, product_id, product_name, sku, image, unit_price, quantity, subtotal, company_id, is_gift');

  d := replace(d,
    '    _company_id
  FROM (',
    '    _company_id,
    (_is_staff AND x.is_gift)
  FROM (');

  d := replace(d,
    '      GREATEST(COALESCE((item->>''quantity'')::int, 1), 1) AS quantity',
    '      GREATEST(COALESCE((item->>''quantity'')::int, 1), 1) AS quantity,
      COALESCE((item->>''is_gift'')::boolean, false) AS is_gift');

  IF position('is_gift' in d) = 0 THEN
    RAISE EXCEPTION 'patch failed: is_gift not injected';
  END IF;

  EXECUTE d;
END
$mig$;

-- 贈品欄位在 UPDATE 時也強制歸零，避免事後改標記留下金額／獎勵點
DROP TRIGGER IF EXISTS trg_enforce_sales_order_item_pricing_upd ON public.sales_order_items;
CREATE TRIGGER trg_enforce_sales_order_item_pricing_upd
BEFORE UPDATE OF is_gift ON public.sales_order_items
FOR EACH ROW WHEN (COALESCE(NEW.is_gift, false))
EXECUTE FUNCTION public.enforce_sales_order_item_pricing();