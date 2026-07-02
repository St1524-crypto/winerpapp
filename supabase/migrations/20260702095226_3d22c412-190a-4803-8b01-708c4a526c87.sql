
CREATE OR REPLACE FUNCTION public.create_sales_order_with_point_payments(
  _order jsonb,
  _items jsonb,
  _payments jsonb DEFAULT '[]'::jsonb,
  _point_payments jsonb DEFAULT '[]'::jsonb
)
RETURNS public.sales_orders
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  new_order public.sales_orders;
  _company_id uuid;
  _user_id uuid;
  pp jsonb;
  _ptype text;
  _points int;
  _offset numeric;
  _col text;
  _new_balance int;
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

  _user_id := NULLIF(_order->>'user_id','')::uuid;

  INSERT INTO public.sales_orders (
    order_no, user_id, customer_id, customer_name, customer_email, customer_phone,
    receiver_name, receiver_phone, shipping_address, shipping_method,
    subtotal, shipping_fee, discount_amount, total_amount, notes,
    order_status, shipping_status, payment_status, company_id
  )
  VALUES (
    _order->>'order_no',
    _user_id,
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

  IF _point_payments IS NOT NULL AND jsonb_array_length(_point_payments) > 0 THEN
    IF _user_id IS NULL THEN
      RAISE EXCEPTION '使用點數付款需綁定會員';
    END IF;

    INSERT INTO public.member_points_wallet(user_id) VALUES (_user_id)
      ON CONFLICT (user_id) DO NOTHING;

    FOR pp IN SELECT * FROM jsonb_array_elements(_point_payments) LOOP
      _ptype := pp->>'point_type';
      _points := COALESCE((pp->>'points_used')::int, 0);
      _offset := COALESCE((pp->>'amount_offset')::numeric, 0);
      IF _points <= 0 THEN CONTINUE; END IF;

      _col := CASE _ptype
        WHEN 'discount' THEN 'discount_points'
        WHEN 'shopping' THEN 'shopping_points'
        WHEN 'reward'   THEN 'reward_points'
        ELSE NULL END;
      IF _col IS NULL THEN
        RAISE EXCEPTION '不支援的點數類型: %', _ptype;
      END IF;

      EXECUTE format(
        'UPDATE public.member_points_wallet SET %I = %I - $1, updated_at = now() WHERE user_id = $2 AND %I >= $1 RETURNING %I',
        _col, _col, _col, _col
      ) INTO _new_balance USING _points, _user_id;

      IF _new_balance IS NULL THEN
        RAISE EXCEPTION '%點數餘額不足', _ptype;
      END IF;

      INSERT INTO public.point_transactions(user_id, point_type, amount, balance_after, source, reference_id, note)
      VALUES (_user_id, _ptype, -_points, _new_balance, 'sales_order', new_order.id,
              COALESCE(pp->>'note', format('訂單 %s 折抵 %s 元', new_order.order_no, _offset::text)));
    END LOOP;
  END IF;

  RETURN new_order;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_sales_order_with_point_payments(jsonb, jsonb, jsonb, jsonb) TO authenticated, service_role;
