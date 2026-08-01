CREATE OR REPLACE FUNCTION public.restock_on_sales_order_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before int;
  v_after  int;
  v_qty    int := GREATEST(COALESCE(OLD.quantity, 0), 0);
  v_company uuid;
  v_ref    text;
BEGIN
  IF OLD.product_id IS NULL OR v_qty = 0 THEN
    RETURN OLD;
  END IF;

  SELECT COALESCE(p.stock, 0), p.company_id
    INTO v_before, v_company
    FROM public.products p
   WHERE p.id = OLD.product_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  v_after := v_before + v_qty;

  UPDATE public.products SET stock = v_after WHERE id = OLD.product_id;

  SELECT so.order_no INTO v_ref
    FROM public.sales_orders so
   WHERE so.id = OLD.sales_order_id;

  INSERT INTO public.inventory_transactions
    (product_id, type, quantity, before_stock, after_stock, reference_no, reason, company_id)
  VALUES (
    OLD.product_id,
    'sales_return_in',
    v_qty,
    v_before,
    v_after,
    v_ref,
    '訂單品項刪除回補庫存',
    COALESCE(OLD.company_id, v_company)
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_restock_on_sales_order_item_delete ON public.sales_order_items;
CREATE TRIGGER trg_restock_on_sales_order_item_delete
AFTER DELETE ON public.sales_order_items
FOR EACH ROW EXECUTE FUNCTION public.restock_on_sales_order_item_delete();