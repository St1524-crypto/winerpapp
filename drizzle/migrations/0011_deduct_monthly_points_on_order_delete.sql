ALTER TABLE public.monthly_responsibility_points ADD COLUMN IF NOT EXISTS order_points jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION private.deduct_monthly_points_on_order_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _r record;
  _pts numeric;
BEGIN
  FOR _r IN SELECT id, points, order_points FROM public.monthly_responsibility_points
             WHERE OLD.id = ANY(source_order_ids) FOR UPDATE
  LOOP
    IF _r.order_points ? OLD.id::text THEN
      _pts := COALESCE((_r.order_points->>OLD.id::text)::numeric, 0);
    ELSE
      SELECT COALESCE(SUM(COALESCE(i.tier_reward_points, p.reward_points, 0) * i.quantity), 0)
        INTO _pts
        FROM public.sales_order_items i
        LEFT JOIN public.products p ON p.id = i.product_id
       WHERE i.sales_order_id = OLD.id;
    END IF;
    UPDATE public.monthly_responsibility_points
       SET points = GREATEST(COALESCE(points,0) - _pts, 0),
           source_order_ids = array_remove(source_order_ids, OLD.id),
           order_points = order_points - OLD.id::text
     WHERE id = _r.id;
  END LOOP;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_sales_orders_deduct_monthly_points ON public.sales_orders;
CREATE TRIGGER trg_sales_orders_deduct_monthly_points
BEFORE DELETE ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION private.deduct_monthly_points_on_order_delete();