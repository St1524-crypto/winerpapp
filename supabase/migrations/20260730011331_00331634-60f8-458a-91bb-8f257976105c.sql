-- 1) gift_rules
CREATE TABLE public.gift_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  starts_at date,
  ends_at date,
  trigger_type text NOT NULL DEFAULT 'product_qty'
    CHECK (trigger_type IN ('product_qty','order_qty','order_amount','group_qty')),
  threshold numeric NOT NULL DEFAULT 1 CHECK (threshold > 0),
  channel_shop boolean NOT NULL DEFAULT true,
  channel_b2b boolean NOT NULL DEFAULT true,
  max_gift_qty integer NOT NULL DEFAULT 0 CHECK (max_gift_qty >= 0),
  priority integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.gift_rule_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.gift_rules(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, product_id)
);

CREATE TABLE public.gift_rule_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.gift_rules(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  gift_qty integer NOT NULL DEFAULT 1 CHECK (gift_qty > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, product_id)
);

CREATE INDEX idx_gift_rules_active ON public.gift_rules (is_active, priority);
CREATE INDEX idx_gift_rule_conditions_rule ON public.gift_rule_conditions (rule_id);
CREATE INDEX idx_gift_rule_gifts_rule ON public.gift_rule_gifts (rule_id);

-- 2) GRANTS
GRANT SELECT ON public.gift_rules TO anon;
GRANT SELECT ON public.gift_rule_conditions TO anon;
GRANT SELECT ON public.gift_rule_gifts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gift_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gift_rule_conditions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gift_rule_gifts TO authenticated;
GRANT ALL ON public.gift_rules TO service_role;
GRANT ALL ON public.gift_rule_conditions TO service_role;
GRANT ALL ON public.gift_rule_gifts TO service_role;

-- 3) RLS
ALTER TABLE public.gift_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_rule_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_rule_gifts ENABLE ROW LEVEL SECURITY;

-- 4) Policies
CREATE POLICY "Public read active gift rules" ON public.gift_rules
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Staff manage gift rules" ON public.gift_rules
  FOR ALL TO authenticated
  USING (
    (private.has_role(auth.uid(),'super_admin'::app_role)
     OR private.has_role(auth.uid(),'admin'::app_role)
     OR private.has_role(auth.uid(),'sales'::app_role))
    AND (private.has_role(auth.uid(),'super_admin'::app_role)
         OR company_id IS NULL
         OR company_id = private.current_company_id())
  )
  WITH CHECK (
    (private.has_role(auth.uid(),'super_admin'::app_role)
     OR private.has_role(auth.uid(),'admin'::app_role)
     OR private.has_role(auth.uid(),'sales'::app_role))
    AND (private.has_role(auth.uid(),'super_admin'::app_role)
         OR company_id IS NULL
         OR company_id = private.current_company_id())
  );

CREATE POLICY "Public read active gift rule conditions" ON public.gift_rule_conditions
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.gift_rules r WHERE r.id = rule_id AND r.is_active));

CREATE POLICY "Staff manage gift rule conditions" ON public.gift_rule_conditions
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role)
     OR private.has_role(auth.uid(),'admin'::app_role)
     OR private.has_role(auth.uid(),'sales'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role)
     OR private.has_role(auth.uid(),'admin'::app_role)
     OR private.has_role(auth.uid(),'sales'::app_role));

CREATE POLICY "Public read active gift rule gifts" ON public.gift_rule_gifts
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.gift_rules r WHERE r.id = rule_id AND r.is_active));

CREATE POLICY "Staff manage gift rule gifts" ON public.gift_rule_gifts
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role)
     OR private.has_role(auth.uid(),'admin'::app_role)
     OR private.has_role(auth.uid(),'sales'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role)
     OR private.has_role(auth.uid(),'admin'::app_role)
     OR private.has_role(auth.uid(),'sales'::app_role));

-- 5) updated_at trigger
CREATE TRIGGER trg_gift_rules_updated_at
  BEFORE UPDATE ON public.gift_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6) sales_order_items gift columns
ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS is_gift boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gift_rule_id uuid REFERENCES public.gift_rules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_order_items_gift
  ON public.sales_order_items (sales_order_id) WHERE is_gift = true;

-- 7) pricing trigger: gift lines are always free and carry no reward points
CREATE OR REPLACE FUNCTION public.enforce_sales_order_item_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _q record;
  _base numeric;
  _is_staff boolean := false;
  _uid uuid := auth.uid();
BEGIN
  IF COALESCE(NEW.is_gift, false) THEN
    NEW.unit_price := 0;
    NEW.subtotal := 0;
    NEW.tier_reward_points := 0;
    RETURN NEW;
  END IF;

  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.price INTO _base FROM public.products p WHERE p.id = NEW.product_id;
  IF _base IS NULL THEN
    RETURN NEW;
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

  IF NEW.original_unit_price IS NULL THEN
    NEW.original_unit_price := _base;
  END IF;

  IF FOUND AND _q.applied THEN
    IF NEW.tier_min_qty IS NULL THEN NEW.tier_min_qty := _q.tier_min_qty; END IF;
    IF NEW.tier_max_qty IS NULL THEN NEW.tier_max_qty := _q.tier_max_qty; END IF;
    IF NEW.pricing_tier_visibility IS NULL THEN NEW.pricing_tier_visibility := _q.visibility; END IF;
    IF NEW.tier_reward_points IS NULL THEN NEW.tier_reward_points := COALESCE(_q.unit_reward_points, 0); END IF;
  END IF;

  IF NOT _is_staff THEN
    IF NEW.unit_price IS NULL OR NEW.unit_price < COALESCE(_q.unit_price, _base) THEN
      NEW.unit_price := COALESCE(_q.unit_price, _base);
    END IF;
    NEW.subtotal := NEW.unit_price * COALESCE(NEW.quantity, 1);
  END IF;

  RETURN NEW;
END;
$$;