ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS shipped_by uuid,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz;

CREATE TABLE IF NOT EXISTS public.shipment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  sales_order_item_id uuid NOT NULL REFERENCES public.sales_order_items(id) ON DELETE CASCADE,
  product_id uuid,
  product_name text,
  quantity integer NOT NULL CHECK (quantity > 0),
  company_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment ON public.shipment_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_items_order_item ON public.shipment_items(sales_order_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipment_items TO authenticated;
GRANT ALL ON public.shipment_items TO service_role;

ALTER TABLE public.shipment_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View shipment items" ON public.shipment_items;
CREATE POLICY "View shipment items" ON public.shipment_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shipments s
      JOIN public.sales_orders o ON o.id = s.sales_order_id
      WHERE s.id = shipment_items.shipment_id AND o.user_id = auth.uid()
    )
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
  );

DROP POLICY IF EXISTS "Warehouse manage shipment items" ON public.shipment_items;
CREATE POLICY "Warehouse manage shipment items" ON public.shipment_items
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'warehouse'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'warehouse'::app_role));

DROP POLICY IF EXISTS "tenant_scope" ON public.shipment_items;
CREATE POLICY "tenant_scope" ON public.shipment_items
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR (company_id IS NOT NULL AND company_id = private.current_company_id()))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role) OR (company_id IS NOT NULL AND company_id = private.current_company_id()));

CREATE OR REPLACE FUNCTION public.assert_shipment_item_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ordered integer;
  v_shipped integer;
BEGIN
  SELECT quantity INTO v_ordered FROM public.sales_order_items WHERE id = NEW.sales_order_item_id;
  IF v_ordered IS NULL THEN
    RAISE EXCEPTION '找不到訂單品項';
  END IF;

  SELECT COALESCE(SUM(si.quantity), 0) INTO v_shipped
  FROM public.shipment_items si
  JOIN public.shipments s ON s.id = si.shipment_id
  WHERE si.sales_order_item_id = NEW.sales_order_item_id
    AND s.voided_at IS NULL
    AND si.id <> NEW.id;

  IF v_shipped + NEW.quantity > v_ordered THEN
    RAISE EXCEPTION '出貨數量超過訂購數量（已出 %，訂購 %，本次 %）', v_shipped, v_ordered, NEW.quantity;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assert_shipment_item_quantity ON public.shipment_items;
CREATE TRIGGER trg_assert_shipment_item_quantity
  BEFORE INSERT OR UPDATE ON public.shipment_items
  FOR EACH ROW EXECUTE FUNCTION public.assert_shipment_item_quantity();

CREATE OR REPLACE FUNCTION public.recalc_order_shipping_status(_order_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ordered integer;
  v_shipped integer;
  v_status text;
  v_current text;
BEGIN
  SELECT COALESCE(SUM(quantity), 0) INTO v_ordered
  FROM public.sales_order_items WHERE sales_order_id = _order_id;

  SELECT COALESCE(SUM(si.quantity), 0) INTO v_shipped
  FROM public.shipment_items si
  JOIN public.shipments s ON s.id = si.shipment_id
  WHERE s.sales_order_id = _order_id AND s.voided_at IS NULL;

  SELECT shipping_status INTO v_current FROM public.sales_orders WHERE id = _order_id;

  IF v_shipped <= 0 THEN
    v_status := 'pending';
  ELSIF v_ordered > 0 AND v_shipped >= v_ordered THEN
    v_status := 'shipped';
  ELSE
    v_status := 'partial';
  END IF;

  -- 已送達為人工終態，僅在全部退回未出貨時才改回
  IF v_current = 'delivered' AND v_shipped > 0 THEN
    RETURN v_current;
  END IF;

  UPDATE public.sales_orders SET shipping_status = v_status, updated_at = now() WHERE id = _order_id;
  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_order_shipment(
  _order_id uuid,
  _items jsonb,
  _shipped_at timestamptz DEFAULT now(),
  _shipping_company text DEFAULT NULL,
  _tracking_no text DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  VALUES (_order_id, _shipping_company, _tracking_no, 'shipped', COALESCE(_shipped_at, now()), v_company, v_uid, _note)
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
$$;

CREATE OR REPLACE FUNCTION public.void_order_shipment(_shipment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order_id uuid;
  v_company uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '未登入';
  END IF;
  IF NOT (private.has_role(v_uid, 'super_admin'::app_role)
       OR private.has_role(v_uid, 'admin'::app_role)
       OR private.has_role(v_uid, 'warehouse'::app_role)) THEN
    RAISE EXCEPTION '權限不足：需要 warehouse / admin / super_admin';
  END IF;

  SELECT sales_order_id, company_id INTO v_order_id, v_company FROM public.shipments WHERE id = _shipment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到出貨單';
  END IF;
  IF NOT private.has_role(v_uid, 'super_admin'::app_role)
     AND v_company IS DISTINCT FROM private.current_company_id() THEN
    RAISE EXCEPTION '權限不足：非本公司出貨單';
  END IF;

  UPDATE public.shipments SET voided_at = now(), status = 'voided', updated_at = now() WHERE id = _shipment_id;

  RETURN jsonb_build_object('ok', true, 'shipping_status', public.recalc_order_shipping_status(v_order_id));
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_shipment(uuid, jsonb, timestamptz, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_order_shipment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recalc_order_shipping_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_shipment(uuid, jsonb, timestamptz, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_order_shipment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalc_order_shipping_status(uuid) TO service_role;