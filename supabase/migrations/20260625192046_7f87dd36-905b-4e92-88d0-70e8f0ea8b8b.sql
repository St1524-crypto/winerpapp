
-- Commit 1: Public retail tier RPC + anon read policy + server-side pricing guard

-- 1. Allow anonymous (guest) users to read retail tiers marked visibility='all'
DROP POLICY IF EXISTS "Public read retail tiers" ON public.product_wholesale_tiers;
CREATE POLICY "Public read retail tiers"
  ON public.product_wholesale_tiers
  FOR SELECT
  TO anon
  USING (visibility = 'all');

GRANT SELECT ON public.product_wholesale_tiers TO anon;

-- 2. Bulk pricing RPC: returns authoritative unit price + tier snapshot for a list of items
CREATE OR REPLACE FUNCTION public.quote_retail_prices(_items jsonb)
RETURNS TABLE(
  product_id uuid,
  requested_qty integer,
  base_price numeric,
  unit_price numeric,
  unit_reward_points integer,
  tier_min_qty integer,
  tier_max_qty integer,
  visibility text,
  applied boolean,
  line_subtotal numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item jsonb;
  _pid uuid;
  _qty integer;
  _q record;
BEGIN
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN
    RETURN;
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _pid := NULLIF(_item->>'product_id','')::uuid;
    _qty := GREATEST(COALESCE((_item->>'quantity')::int, 1), 1);
    IF _pid IS NULL THEN CONTINUE; END IF;

    SELECT * INTO _q FROM public.quote_wholesale_price(_pid, _qty);
    IF NOT FOUND THEN CONTINUE; END IF;

    product_id := _pid;
    requested_qty := _qty;
    SELECT p.price INTO base_price FROM public.products p WHERE p.id = _pid;
    unit_price := _q.unit_price;
    unit_reward_points := COALESCE(_q.unit_reward_points, 0);
    tier_min_qty := _q.tier_min_qty;
    tier_max_qty := _q.tier_max_qty;
    visibility := _q.visibility;
    applied := _q.applied;
    line_subtotal := _q.unit_price * _qty;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.quote_retail_prices(jsonb) TO anon, authenticated;

-- 3. Pricing guard trigger on sales_order_items
-- - Snapshots original_unit_price, tier_min_qty, tier_max_qty, pricing_tier_visibility, tier_reward_points
-- - For non-staff inserts, overwrites unit_price with server-authoritative price (anti-tamper)
-- - Staff (admin/finance/sales) can set custom unit_price (manual discount workflows)
CREATE OR REPLACE FUNCTION public.enforce_sales_order_item_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _q record;
  _base numeric;
  _is_staff boolean := false;
  _uid uuid := auth.uid();
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.price INTO _base FROM public.products p WHERE p.id = NEW.product_id;
  IF _base IS NULL THEN
    RETURN NEW; -- unknown product, let FK / other checks decide
  END IF;

  IF _uid IS NOT NULL THEN
    _is_staff :=
      private.has_role(_uid, 'super_admin'::app_role)
      OR private.has_role(_uid, 'admin'::app_role)
      OR private.has_role(_uid, 'finance'::app_role)
      OR private.has_role(_uid, 'sales'::app_role);
  END IF;
  IF current_setting('role', true) = 'service_role'
     OR session_user IN ('postgres','supabase_admin','service_role')
  THEN
    _is_staff := true;
  END IF;

  SELECT * INTO _q FROM public.quote_wholesale_price(NEW.product_id, GREATEST(COALESCE(NEW.quantity,1),1));

  -- Always snapshot the catalog price at order time
  IF NEW.original_unit_price IS NULL THEN
    NEW.original_unit_price := _base;
  END IF;

  IF FOUND AND _q.applied THEN
    IF NEW.tier_min_qty IS NULL THEN NEW.tier_min_qty := _q.tier_min_qty; END IF;
    IF NEW.tier_max_qty IS NULL THEN NEW.tier_max_qty := _q.tier_max_qty; END IF;
    IF NEW.pricing_tier_visibility IS NULL THEN NEW.pricing_tier_visibility := _q.visibility; END IF;
    IF NEW.tier_reward_points IS NULL THEN NEW.tier_reward_points := COALESCE(_q.unit_reward_points, 0); END IF;
  END IF;

  -- Anti-tamper: non-staff cannot set a unit_price lower than authoritative quote
  IF NOT _is_staff THEN
    IF NEW.unit_price IS NULL OR NEW.unit_price < COALESCE(_q.unit_price, _base) THEN
      NEW.unit_price := COALESCE(_q.unit_price, _base);
    END IF;
    NEW.subtotal := NEW.unit_price * COALESCE(NEW.quantity, 1);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_sales_order_item_pricing ON public.sales_order_items;
CREATE TRIGGER trg_enforce_sales_order_item_pricing
  BEFORE INSERT ON public.sales_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_sales_order_item_pricing();
