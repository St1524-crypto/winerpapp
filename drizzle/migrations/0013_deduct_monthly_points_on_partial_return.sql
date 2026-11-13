CREATE OR REPLACE FUNCTION private.deduct_monthly_points_on_return_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _r record;
  _order_item_pts numeric;
  _returned_item_pts numeric;
  _recorded numeric;
  _deduct numeric;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' OR NEW.sales_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- points of all items on the order, and of the returned quantities
  SELECT COALESCE(SUM(COALESCE(i.tier_reward_points, p.reward_points, 0) * i.quantity), 0)
    INTO _order_item_pts
    FROM public.sales_order_items i LEFT JOIN public.products p ON p.id = i.product_id
   WHERE i.sales_order_id = NEW.sales_order_id;

  SELECT COALESCE(SUM(COALESCE(i.tier_reward_points, p.reward_points, 0) * LEAST(ri.quantity, i.quantity)), 0)
    INTO _returned_item_pts
    FROM public.sales_return_items ri
    JOIN public.sales_order_items i ON i.id = ri.sales_order_item_id
    LEFT JOIN public.products p ON p.id = i.product_id
   WHERE ri.sales_return_id = NEW.id;

  IF _returned_item_pts <= 0 THEN RETURN NEW; END IF;

  FOR _r IN SELECT id, order_points FROM public.monthly_responsibility_points
             WHERE NEW.sales_order_id = ANY(source_order_ids) FOR UPDATE
  LOOP
    IF _r.order_points ? NEW.sales_order_id::text AND _order_item_pts > 0 THEN
      _recorded := COALESCE((_r.order_points->>NEW.sales_order_id::text)::numeric, 0);
      _deduct := LEAST(_recorded, floor(_recorded * _returned_item_pts / _order_item_pts));
      UPDATE public.monthly_responsibility_points
         SET points = GREATEST(COALESCE(points,0) - _deduct, 0),
             order_points = jsonb_set(order_points, ARRAY[NEW.sales_order_id::text], to_jsonb(_recorded - _deduct))
       WHERE id = _r.id;
    ELSE
      UPDATE public.monthly_responsibility_points
         SET points = GREATEST(COALESCE(points,0) - _returned_item_pts, 0)
       WHERE id = _r.id;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sales_returns_deduct_monthly_points ON public.sales_returns;
CREATE TRIGGER trg_sales_returns_deduct_monthly_points
AFTER UPDATE OF status ON public.sales_returns
FOR EACH ROW EXECUTE FUNCTION private.deduct_monthly_points_on_return_complete();