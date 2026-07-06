-- Harden direct writes for orders, VIP upgrade orders, profiles, and group buys.
-- Normal app flows should use server functions / RPCs; direct client table writes
-- must not be able to forge paid status, privileged profile fields, or pricing.

-- 1) Sales orders: members may not directly create orders/items/payments.
-- Checkout and admin order creation use create_sales_order_with_point_payments().
DROP POLICY IF EXISTS "Users create own sales orders" ON public.sales_orders;
DROP POLICY IF EXISTS "Staff create sales orders" ON public.sales_orders;
CREATE POLICY "Staff create sales orders"
  ON public.sales_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
  );

DROP POLICY IF EXISTS "Manage sales order items" ON public.sales_order_items;
DROP POLICY IF EXISTS "Staff manage sales order items" ON public.sales_order_items;
CREATE POLICY "Staff manage sales order items"
  ON public.sales_order_items
  FOR ALL
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
  );

DROP POLICY IF EXISTS "Manage payments" ON public.payments;
DROP POLICY IF EXISTS "Staff manage payments" ON public.payments;
CREATE POLICY "Staff manage payments"
  ON public.payments
  FOR ALL
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
  );

-- 2) VIP upgrade orders: self-created rows must remain pending only.
DROP POLICY IF EXISTS "vip_orders self insert" ON public.vip_upgrade_orders;
DROP POLICY IF EXISTS "vip_orders self insert pending" ON public.vip_upgrade_orders;
CREATE POLICY "vip_orders self insert pending"
  ON public.vip_upgrade_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND payment_status = 'pending'
    AND paid_at IS NULL
    AND applied_at IS NULL
    AND new_tier IS NULL
    AND sales_order_id IS NULL
  );

-- 3) Profiles: include vip_tier in privileged-field protection.
CREATE OR REPLACE FUNCTION public.profiles_block_sensitive_self_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private'
AS $$
DECLARE
  _is_admin boolean;
  _sensitive_set boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_vip            IS NOT DISTINCT FROM NEW.is_vip
       AND OLD.is_dealer     IS NOT DISTINCT FROM NEW.is_dealer
       AND OLD.member_status IS NOT DISTINCT FROM NEW.member_status
       AND OLD.vip_expires_at IS NOT DISTINCT FROM NEW.vip_expires_at
       AND OLD.vip_tier      IS NOT DISTINCT FROM NEW.vip_tier
       AND OLD.legacy_rank   IS NOT DISTINCT FROM NEW.legacy_rank
       AND OLD.placement_id  IS NOT DISTINCT FROM NEW.placement_id
       AND OLD.referred_by   IS NOT DISTINCT FROM NEW.referred_by
    THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    _sensitive_set :=
      COALESCE(NEW.is_vip, false) = true
      OR COALESCE(NEW.is_dealer, false) = true
      OR NEW.vip_expires_at IS NOT NULL
      OR NEW.vip_tier IS NOT NULL
      OR NEW.legacy_rank IS NOT NULL
      OR NEW.placement_id IS NOT NULL
      OR NEW.referred_by IS NOT NULL
      OR (NEW.member_status IS NOT NULL AND NEW.member_status <> 'active');
    IF NOT _sensitive_set THEN
      RETURN NEW;
    END IF;
  END IF;

  IF current_setting('role', true) = 'service_role'
     OR session_user IN ('postgres','supabase_admin','service_role')
  THEN
    RETURN NEW;
  END IF;

  SELECT private.has_role(auth.uid(), 'super_admin'::app_role)
      OR private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'finance'::app_role)
    INTO _is_admin;

  IF NOT COALESCE(_is_admin, false) THEN
    RAISE EXCEPTION 'Permission denied: cannot set privileged profile fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_sensitive_self_update ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_block_sensitive_self_update ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_block_sensitive_self_write ON public.profiles;
CREATE TRIGGER trg_profiles_block_sensitive_self_write
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_block_sensitive_self_write();

REVOKE UPDATE (
  is_vip,
  is_dealer,
  member_status,
  vip_expires_at,
  vip_tier,
  legacy_rank,
  placement_id,
  referred_by,
  id_no
) ON public.profiles FROM authenticated;

-- 4) Group buys: members must use server functions so pricing and paid state are derived.
DROP POLICY IF EXISTS "gb initiator insert" ON public.group_buys;
DROP POLICY IF EXISTS "gb staff insert" ON public.group_buys;
CREATE POLICY "gb staff insert"
  ON public.group_buys
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
  );

DROP POLICY IF EXISTS "gbo self insert" ON public.group_buy_orders;
DROP POLICY IF EXISTS "gbo staff insert" ON public.group_buy_orders;
CREATE POLICY "gbo staff insert"
  ON public.group_buy_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
  );

-- 5) Harden the order RPC for authenticated callers.
CREATE OR REPLACE FUNCTION public.create_sales_order_with_point_payments(
  _order jsonb,
  _items jsonb,
  _payments jsonb DEFAULT '[]'::jsonb,
  _point_payments jsonb DEFAULT '[]'::jsonb
)
RETURNS public.sales_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private'
AS $function$
DECLARE
  new_order public.sales_orders;
  _company_id uuid;
  _caller_id uuid := auth.uid();
  _member_id uuid;
  _is_staff boolean := false;
  _shipping_fee numeric := 0;
  _authoritative_subtotal numeric := 0;
  _total_amount numeric := 0;
  _point_offset_total numeric := 0;
  _payment_total numeric := 0;
  _cash_amount_due numeric := 0;
  _seen_point_types text[] := ARRAY[]::text[];
  _wallet record;
  _shopping_balance integer := 0;
  _reward_balance integer := 0;
  _discount_balance integer := 0;
  _point_payment jsonb;
  _point_type text;
  _points_used integer;
  _amount_offset numeric;
  _balance_after integer;
  _point_transaction_id uuid;
  _dedupe_key text;
BEGIN
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'order must include at least one item';
  END IF;

  IF _payments IS NULL THEN _payments := '[]'::jsonb; END IF;
  IF jsonb_typeof(_payments) <> 'array' THEN
    RAISE EXCEPTION '_payments must be a JSON array';
  END IF;

  IF _point_payments IS NULL THEN _point_payments := '[]'::jsonb; END IF;
  IF jsonb_typeof(_point_payments) <> 'array' THEN
    RAISE EXCEPTION '_point_payments must be a JSON array';
  END IF;

  IF _caller_id IS NOT NULL THEN
    _is_staff :=
      private.has_role(_caller_id, 'super_admin'::app_role)
      OR private.has_role(_caller_id, 'admin'::app_role)
      OR private.has_role(_caller_id, 'finance'::app_role)
      OR private.has_role(_caller_id, 'sales'::app_role);
  END IF;

  _company_id := COALESCE(NULLIF(_order->>'company_id','')::uuid, public.current_company_id());
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'missing company context';
  END IF;

  _member_id := NULLIF(_order->>'user_id','')::uuid;
  _shipping_fee := GREATEST(COALESCE((_order->>'shipping_fee')::numeric, 0), 0);

  IF NOT _is_staff THEN
    IF _caller_id IS NULL OR _member_id IS NULL OR _caller_id <> _member_id THEN
      RAISE EXCEPTION 'members can only create their own orders';
    END IF;
    IF jsonb_array_length(_payments) > 0 THEN
      RAISE EXCEPTION 'members cannot submit cash payment records during order creation';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(_items) AS item
      WHERE NULLIF(item->>'product_id','') IS NULL
    ) THEN
      RAISE EXCEPTION 'product_id is required for member checkout items';
    END IF;
  END IF;

  FOR _point_payment IN SELECT value FROM jsonb_array_elements(_point_payments)
  LOOP
    _point_type := _point_payment->>'point_type';
    IF _point_type NOT IN ('discount', 'shopping', 'reward') THEN
      RAISE EXCEPTION 'unsupported point_type: %', COALESCE(_point_type, '(empty)');
    END IF;
    IF _point_type = ANY(_seen_point_types) THEN
      RAISE EXCEPTION 'duplicate point_type in one order: %', _point_type;
    END IF;
    _seen_point_types := array_append(_seen_point_types, _point_type);

    _points_used := COALESCE((_point_payment->>'points_used')::integer, 0);
    _amount_offset := COALESCE((_point_payment->>'amount_offset')::numeric, 0);
    IF _points_used <= 0 THEN
      RAISE EXCEPTION 'points_used must be > 0';
    END IF;
    IF _amount_offset < 0 THEN
      RAISE EXCEPTION 'amount_offset must be >= 0';
    END IF;
    IF NOT _is_staff AND _amount_offset > _points_used THEN
      RAISE EXCEPTION 'point amount_offset cannot exceed points_used';
    END IF;
    _point_offset_total := _point_offset_total + _amount_offset;
  END LOOP;

  INSERT INTO public.sales_orders (
    order_no, user_id, customer_id, customer_name, customer_email, customer_phone,
    receiver_name, receiver_phone, shipping_address, shipping_method,
    subtotal, shipping_fee, discount_amount, total_amount, notes,
    order_status, shipping_status, payment_status, company_id
  )
  VALUES (
    _order->>'order_no',
    _member_id,
    NULLIF(_order->>'customer_id','')::uuid,
    _order->>'customer_name',
    NULLIF(_order->>'customer_email',''),
    NULLIF(_order->>'customer_phone',''),
    _order->>'receiver_name',
    _order->>'receiver_phone',
    _order->>'shipping_address',
    COALESCE(_order->>'shipping_method', 'home_delivery'),
    CASE WHEN _is_staff THEN COALESCE((_order->>'subtotal')::numeric, 0) ELSE 0 END,
    _shipping_fee,
    CASE WHEN _is_staff THEN COALESCE((_order->>'discount_amount')::numeric, 0) ELSE _point_offset_total END,
    CASE WHEN _is_staff THEN COALESCE((_order->>'total_amount')::numeric, 0) ELSE 0 END,
    NULLIF(_order->>'notes',''),
    CASE WHEN _is_staff THEN COALESCE(_order->>'order_status', 'pending') ELSE 'pending' END,
    CASE WHEN _is_staff THEN COALESCE(_order->>'shipping_status', 'pending') ELSE 'pending' END,
    CASE WHEN _is_staff THEN COALESCE(_order->>'payment_status', 'pending') ELSE 'pending' END,
    _company_id
  )
  RETURNING * INTO new_order;

  INSERT INTO public.sales_order_items (
    sales_order_id, product_id, product_name, sku, image, unit_price, quantity, subtotal, company_id
  )
  SELECT
    new_order.id,
    x.product_id,
    CASE WHEN _is_staff THEN x.product_name ELSE COALESCE(p.name, x.product_name) END,
    CASE WHEN _is_staff THEN x.sku ELSE COALESCE(p.sku, x.sku) END,
    CASE WHEN _is_staff THEN x.image ELSE COALESCE(p.image, x.image) END,
    CASE WHEN _is_staff THEN x.input_unit_price ELSE COALESCE(q.unit_price, p.price, x.input_unit_price) END,
    x.quantity,
    (CASE WHEN _is_staff THEN x.input_unit_price ELSE COALESCE(q.unit_price, p.price, x.input_unit_price) END) * x.quantity,
    _company_id
  FROM (
    SELECT
      NULLIF(item->>'product_id','')::uuid AS product_id,
      item->>'product_name' AS product_name,
      NULLIF(item->>'sku','') AS sku,
      NULLIF(item->>'image','') AS image,
      GREATEST(COALESCE((item->>'unit_price')::numeric, 0), 0) AS input_unit_price,
      GREATEST(COALESCE((item->>'quantity')::int, 1), 1) AS quantity
    FROM jsonb_array_elements(_items) AS item
  ) AS x
  LEFT JOIN public.products p ON p.id = x.product_id AND p.status = 'active'
  LEFT JOIN LATERAL public.quote_wholesale_price(x.product_id, x.quantity) q ON true;

  IF NOT _is_staff AND EXISTS (
    SELECT 1
    FROM public.sales_order_items soi
    LEFT JOIN public.products p ON p.id = soi.product_id AND p.status = 'active'
    WHERE soi.sales_order_id = new_order.id
      AND p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'member checkout item contains inactive or missing product';
  END IF;

  SELECT COALESCE(SUM(subtotal), 0)
    INTO _authoritative_subtotal
    FROM public.sales_order_items
    WHERE sales_order_id = new_order.id;

  IF _is_staff THEN
    _total_amount := COALESCE((_order->>'total_amount')::numeric, 0);
  ELSE
    _total_amount := _authoritative_subtotal + _shipping_fee;
    UPDATE public.sales_orders
       SET subtotal = _authoritative_subtotal,
           shipping_fee = _shipping_fee,
           discount_amount = _point_offset_total,
           total_amount = _total_amount
     WHERE id = new_order.id;
  END IF;

  IF _point_offset_total > _total_amount THEN
    RAISE EXCEPTION 'point offset total cannot exceed order total_amount';
  END IF;

  SELECT COALESCE(SUM(COALESCE((p->>'amount')::numeric, 0)), 0)
    INTO _payment_total
    FROM jsonb_array_elements(_payments) AS p;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_payments) AS p
    WHERE COALESCE((p->>'amount')::numeric, 0) < 0
  ) THEN
    RAISE EXCEPTION 'payment amount must be >= 0';
  END IF;

  _cash_amount_due := _total_amount - _point_offset_total;
  IF _payment_total > _cash_amount_due THEN
    RAISE EXCEPTION 'cash payment total cannot exceed cash amount due';
  END IF;

  IF jsonb_array_length(_point_payments) > 0 THEN
    IF _member_id IS NULL THEN
      RAISE EXCEPTION 'user_id is required when point payments are used';
    END IF;
    IF _caller_id IS NULL THEN
      RAISE EXCEPTION 'authentication is required when point payments are used';
    END IF;
    IF _caller_id <> _member_id AND NOT _is_staff THEN
      RAISE EXCEPTION 'cannot use another member point balance';
    END IF;

    INSERT INTO public.member_points_wallet (user_id)
    VALUES (_member_id)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT shopping_points, reward_points, discount_points
      INTO _wallet
      FROM public.member_points_wallet
      WHERE user_id = _member_id
      FOR UPDATE;

    _shopping_balance := COALESCE(_wallet.shopping_points, 0);
    _reward_balance := COALESCE(_wallet.reward_points, 0);
    _discount_balance := COALESCE(_wallet.discount_points, 0);

    FOR _point_payment IN SELECT value FROM jsonb_array_elements(_point_payments)
    LOOP
      _point_type := _point_payment->>'point_type';
      _points_used := COALESCE((_point_payment->>'points_used')::integer, 0);

      IF _point_type = 'discount' THEN
        IF _discount_balance < _points_used THEN
          RAISE EXCEPTION 'insufficient discount points: balance %, required %', _discount_balance, _points_used;
        END IF;
        _discount_balance := _discount_balance - _points_used;
      ELSIF _point_type = 'shopping' THEN
        IF _shopping_balance < _points_used THEN
          RAISE EXCEPTION 'insufficient shopping points: balance %, required %', _shopping_balance, _points_used;
        END IF;
        _shopping_balance := _shopping_balance - _points_used;
      ELSIF _point_type = 'reward' THEN
        IF _reward_balance < _points_used THEN
          RAISE EXCEPTION 'insufficient reward points: balance %, required %', _reward_balance, _points_used;
        END IF;
        _reward_balance := _reward_balance - _points_used;
      END IF;
    END LOOP;

    UPDATE public.member_points_wallet
       SET shopping_points = _shopping_balance,
           reward_points = _reward_balance,
           discount_points = _discount_balance,
           updated_at = now()
     WHERE user_id = _member_id;

    FOR _point_payment IN SELECT value FROM jsonb_array_elements(_point_payments)
    LOOP
      _point_type := _point_payment->>'point_type';
      _points_used := COALESCE((_point_payment->>'points_used')::integer, 0);
      _amount_offset := COALESCE((_point_payment->>'amount_offset')::numeric, 0);
      _balance_after := CASE
        WHEN _point_type = 'discount' THEN _discount_balance
        WHEN _point_type = 'shopping' THEN _shopping_balance
        ELSE _reward_balance
      END;

      INSERT INTO public.point_transactions (
        user_id, point_type, amount, balance_after, source, reference_id, note, created_by
      )
      VALUES (
        _member_id,
        _point_type,
        -_points_used,
        _balance_after,
        'order_redeem',
        new_order.id,
        NULLIF(_point_payment->>'note',''),
        _caller_id
      )
      RETURNING id INTO _point_transaction_id;

      _dedupe_key := new_order.id::text || ':' || _point_type;

      INSERT INTO public.order_point_payments (
        sales_order_id, member_id, point_type, points_used, amount_offset,
        status, point_transaction_id, dedupe_key, created_by, note
      )
      VALUES (
        new_order.id,
        _member_id,
        _point_type,
        _points_used,
        _amount_offset,
        'applied',
        _point_transaction_id,
        _dedupe_key,
        _caller_id,
        NULLIF(_point_payment->>'note','')
      );
    END LOOP;
  END IF;

  IF jsonb_array_length(_payments) > 0 THEN
    INSERT INTO public.payments (
      sales_order_id, amount, payment_method, payment_status, paid_at, company_id
    )
    SELECT
      new_order.id,
      COALESCE((p->>'amount')::numeric, 0),
      COALESCE(p->>'payment_method', 'bank_transfer'),
      CASE WHEN _is_staff THEN COALESCE(p->>'payment_status', 'pending') ELSE 'pending' END,
      CASE WHEN _is_staff THEN NULLIF(p->>'paid_at','')::timestamptz ELSE NULL END,
      _company_id
    FROM jsonb_array_elements(_payments) AS p
    WHERE COALESCE((p->>'amount')::numeric, 0) > 0;
  END IF;

  IF NOT _is_staff THEN
    UPDATE public.sales_orders
       SET payment_status = CASE
             WHEN _cash_amount_due = 0 AND _point_offset_total > 0 THEN 'paid'
             ELSE 'pending'
           END
     WHERE id = new_order.id;
  END IF;

  SELECT * INTO new_order FROM public.sales_orders WHERE id = new_order.id;
  RETURN new_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_sales_order_with_point_payments(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sales_order_with_point_payments(jsonb, jsonb, jsonb, jsonb) TO authenticated, service_role;
