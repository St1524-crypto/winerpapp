CREATE OR REPLACE FUNCTION private.deduct_monthly_points_for_order(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _r record; _pts numeric;
BEGIN
  FOR _r IN SELECT id, order_points FROM public.monthly_responsibility_points
             WHERE _order_id = ANY(source_order_ids) FOR UPDATE
  LOOP
    IF _r.order_points ? _order_id::text THEN
      _pts := COALESCE((_r.order_points->>_order_id::text)::numeric, 0);
    ELSE
      SELECT COALESCE(SUM(COALESCE(i.tier_reward_points, p.reward_points, 0) * i.quantity), 0)
        INTO _pts
        FROM public.sales_order_items i
        LEFT JOIN public.products p ON p.id = i.product_id
       WHERE i.sales_order_id = _order_id;
    END IF;
    UPDATE public.monthly_responsibility_points
       SET points = GREATEST(COALESCE(points,0) - _pts, 0),
           source_order_ids = array_remove(source_order_ids, _order_id),
           order_points = order_points - _order_id::text
     WHERE id = _r.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.deduct_monthly_points_on_order_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM private.deduct_monthly_points_for_order(OLD.id);
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION private.deduct_monthly_points_on_order_void()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (NEW.order_status = 'cancelled' AND OLD.order_status IS DISTINCT FROM 'cancelled')
     OR (NEW.payment_status = 'refunded' AND OLD.payment_status IS DISTINCT FROM 'refunded') THEN
    PERFORM private.deduct_monthly_points_for_order(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sales_orders_deduct_monthly_points_void ON public.sales_orders;
CREATE TRIGGER trg_sales_orders_deduct_monthly_points_void
AFTER UPDATE OF order_status, payment_status ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION private.deduct_monthly_points_on_order_void();