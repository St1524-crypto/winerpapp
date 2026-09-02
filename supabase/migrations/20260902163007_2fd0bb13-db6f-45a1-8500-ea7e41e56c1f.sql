CREATE OR REPLACE FUNCTION public.create_order_shipment(_order_id uuid, _items jsonb, _shipped_at timestamp with time zone DEFAULT now(), _shipping_company text DEFAULT NULL::text, _tracking_no text DEFAULT NULL::text, _note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_shipment_id uuid;
  v_item jsonb;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '未登入';
  END IF;
  IF NOT (private.has_role(v_uid, 'super_admin'::app_role)
       OR private.has_role(v_uid, 'admin'::app_role)
       OR private.has_role(v_uid, 'warehouse'::app_role)) THEN
    RAISE EXCEPTION '權限不足：需要 warehouse / admin / super_admin';
  END IF;

  SELECT company_id INTO v_company FROM public.sales_orders WHERE id = _order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到訂單';
  END IF;
  IF NOT private.has_role(v_uid, 'super_admin'::app_role)
     AND v_company IS DISTINCT FROM private.current_company_id() THEN
    RAISE EXCEPTION '權限不足：非本公司訂單';
  END IF;

  INSERT INTO public.shipments (sales_order_id, shipping_company, tracking_no, status, shipped_at, company_id, shipped_by, note)
  VALUES (_order_id, COALESCE(NULLIF(btrim(_shipping_company), ''), '未指定'), _tracking_no, 'shipped', COALESCE(_shipped_at, now()), v_company, v_uid, _note)
  RETURNING id INTO v_shipment_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb))
  LOOP
    IF COALESCE((v_item->>'quantity')::int, 0) > 0 THEN
      INSERT INTO public.shipment_items (shipment_id, sales_order_item_id, product_id, product_name, quantity, company_id)
      SELECT v_shipment_id, soi.id, soi.product_id, soi.product_name, (v_item->>'quantity')::int, v_company
      FROM public.sales_order_items soi
      WHERE soi.id = (v_item->>'sales_order_item_id')::uuid
        AND soi.sales_order_id = _order_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION '品項不屬於此訂單: %', v_item->>'sales_order_item_id';
      END IF;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION '請至少選擇一個出貨品項';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'shipment_id', v_shipment_id,
    'items', v_count,
    'shipping_status', public.recalc_order_shipping_status(_order_id)
  );
END;
$function$;