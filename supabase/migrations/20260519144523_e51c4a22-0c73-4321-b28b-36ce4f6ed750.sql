CREATE OR REPLACE FUNCTION public.create_sales_order_with_items(
  _order jsonb,
  _items jsonb,
  _payments jsonb DEFAULT '[]'::jsonb
)
RETURNS public.sales_orders
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  new_order public.sales_orders;
BEGIN
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION '至少需要一項商品明細';
  END IF;

  INSERT INTO public.sales_orders (
    order_no, customer_id, customer_name, customer_email, customer_phone,
    receiver_name, receiver_phone, shipping_address, shipping_method,
    subtotal, shipping_fee, discount_amount, total_amount, notes,
    order_status, shipping_status, payment_status
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
    COALESCE(_order->>'payment_status', 'pending')
  )
  RETURNING * INTO new_order;

  INSERT INTO public.sales_order_items (
    sales_order_id, product_id, product_name, sku, image, unit_price, quantity, subtotal
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
             COALESCE((item->>'unit_price')::numeric,0) * COALESCE((item->>'quantity')::int,1))
  FROM jsonb_array_elements(_items) AS item;

  IF _payments IS NOT NULL AND jsonb_array_length(_payments) > 0 THEN
    INSERT INTO public.payments (
      sales_order_id, amount, payment_method, payment_status, paid_at
    )
    SELECT
      new_order.id,
      COALESCE((p->>'amount')::numeric, 0),
      COALESCE(p->>'payment_method', 'bank_transfer'),
      COALESCE(p->>'payment_status', 'pending'),
      NULLIF(p->>'paid_at','')::timestamptz
    FROM jsonb_array_elements(_payments) AS p
    WHERE COALESCE((p->>'amount')::numeric, 0) > 0;
  END IF;

  RETURN new_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sales_order_with_items(jsonb, jsonb, jsonb) TO authenticated;