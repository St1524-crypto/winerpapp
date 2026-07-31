CREATE OR REPLACE FUNCTION public.deduct_stock_on_sales_order_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before int;
  v_after  int;
  v_qty    int := GREATEST(COALESCE(NEW.quantity, 0), 0);
  v_company uuid;
  v_ref    text;
BEGIN
  IF NEW.product_id IS NULL OR v_qty = 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.stock, 0), p.company_id
    INTO v_before, v_company
    FROM public.products p
   WHERE p.id = NEW.product_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_after := v_before - v_qty;

  UPDATE public.products SET stock = v_after WHERE id = NEW.product_id;

  SELECT so.order_no INTO v_ref
    FROM public.sales_orders so
   WHERE so.id = NEW.sales_order_id;

  INSERT INTO public.inventory_transactions
    (product_id, type, quantity, before_stock, after_stock, reference_no, reason, company_id)
  VALUES (
    NEW.product_id,
    CASE WHEN COALESCE(NEW.is_gift, false) THEN 'sales_gift_out' ELSE 'sales_out' END,
    -v_qty,
    v_before,
    v_after,
    v_ref,
    CASE WHEN COALESCE(NEW.is_gift, false) THEN '訂單贈品出庫' ELSE '訂單出貨扣庫存' END,
    COALESCE(NEW.company_id, v_company)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deduct_stock_on_sales_order_item ON public.sales_order_items;
CREATE TRIGGER trg_deduct_stock_on_sales_order_item
AFTER INSERT ON public.sales_order_items
FOR EACH ROW EXECUTE FUNCTION public.deduct_stock_on_sales_order_item();