
-- 1. customer_addresses
CREATE TABLE public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  receiver_name text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  city text,
  postal_code text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own addresses" ON public.customer_addresses
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'sales'::app_role))
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'sales'::app_role));

-- 2. carts (supports guest via session_token)
CREATE TABLE public.carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  session_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR session_token IS NOT NULL)
);
CREATE INDEX idx_carts_user ON public.carts(user_id);
CREATE INDEX idx_carts_session ON public.carts(session_token);
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
-- Guests are anon role; allow anon + authenticated full access scoped by own session/user
CREATE POLICY "Anon manage carts by session" ON public.carts
  FOR ALL TO anon
  USING (session_token IS NOT NULL)
  WITH CHECK (session_token IS NOT NULL);
CREATE POLICY "Users manage own carts" ON public.carts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR session_token IS NOT NULL OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (auth.uid() = user_id OR session_token IS NOT NULL OR has_role(auth.uid(), 'super_admin'::app_role));

-- 3. cart_items
CREATE TABLE public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cart_items_cart ON public.cart_items(cart_id);
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon manage cart items" ON public.cart_items
  FOR ALL TO anon
  USING (EXISTS(SELECT 1 FROM carts c WHERE c.id = cart_id AND c.session_token IS NOT NULL))
  WITH CHECK (EXISTS(SELECT 1 FROM carts c WHERE c.id = cart_id AND c.session_token IS NOT NULL));
CREATE POLICY "Users manage own cart items" ON public.cart_items
  FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM carts c WHERE c.id = cart_id AND (c.user_id = auth.uid() OR c.session_token IS NOT NULL))
         OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (EXISTS(SELECT 1 FROM carts c WHERE c.id = cart_id AND (c.user_id = auth.uid() OR c.session_token IS NOT NULL))
              OR has_role(auth.uid(), 'super_admin'::app_role));

-- 4. sales_orders
CREATE TABLE public.sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text NOT NULL UNIQUE,
  user_id uuid,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  receiver_name text NOT NULL,
  receiver_phone text NOT NULL,
  shipping_address text NOT NULL,
  shipping_method text NOT NULL DEFAULT 'home_delivery',
  invoice_type text DEFAULT 'personal',
  invoice_tax_id text,
  notes text,
  subtotal numeric NOT NULL DEFAULT 0,
  shipping_fee numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  coupon_code text,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending',
  shipping_status text NOT NULL DEFAULT 'pending',
  order_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sales_orders_user ON public.sales_orders(user_id);
CREATE INDEX idx_sales_orders_status ON public.sales_orders(order_status);
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own sales orders" ON public.sales_orders
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'sales'::app_role) OR has_role(auth.uid(),'finance'::app_role) OR has_role(auth.uid(),'warehouse'::app_role));
CREATE POLICY "Users create own sales orders" ON public.sales_orders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'sales'::app_role));
CREATE POLICY "Staff manage sales orders" ON public.sales_orders
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'sales'::app_role) OR has_role(auth.uid(),'finance'::app_role) OR has_role(auth.uid(),'warehouse'::app_role))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'sales'::app_role) OR has_role(auth.uid(),'finance'::app_role) OR has_role(auth.uid(),'warehouse'::app_role));
CREATE POLICY "Admin delete sales orders" ON public.sales_orders
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role));

-- 5. sales_order_items
CREATE TABLE public.sales_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id uuid,
  product_name text NOT NULL,
  sku text,
  image text,
  unit_price numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  subtotal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_soi_order ON public.sales_order_items(sales_order_id);
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View sales order items" ON public.sales_order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS(SELECT 1 FROM sales_orders o WHERE o.id = sales_order_id AND o.user_id = auth.uid())
    OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'sales'::app_role)
    OR has_role(auth.uid(),'finance'::app_role) OR has_role(auth.uid(),'warehouse'::app_role)
  );
CREATE POLICY "Manage sales order items" ON public.sales_order_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'sales'::app_role)
         OR EXISTS(SELECT 1 FROM sales_orders o WHERE o.id = sales_order_id AND o.user_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'sales'::app_role)
              OR EXISTS(SELECT 1 FROM sales_orders o WHERE o.id = sales_order_id AND o.user_id = auth.uid()));

-- 6. payments
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  payment_status text NOT NULL DEFAULT 'pending',
  amount numeric NOT NULL DEFAULT 0,
  transaction_id text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_order ON public.payments(sales_order_id);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View payments" ON public.payments
  FOR SELECT TO authenticated
  USING (
    EXISTS(SELECT 1 FROM sales_orders o WHERE o.id = sales_order_id AND o.user_id = auth.uid())
    OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'finance'::app_role) OR has_role(auth.uid(),'sales'::app_role)
  );
CREATE POLICY "Manage payments" ON public.payments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'finance'::app_role) OR has_role(auth.uid(),'sales'::app_role)
         OR EXISTS(SELECT 1 FROM sales_orders o WHERE o.id = sales_order_id AND o.user_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'finance'::app_role) OR has_role(auth.uid(),'sales'::app_role)
              OR EXISTS(SELECT 1 FROM sales_orders o WHERE o.id = sales_order_id AND o.user_id = auth.uid()));

-- 7. shipments
CREATE TABLE public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  shipping_company text NOT NULL,
  tracking_no text,
  status text NOT NULL DEFAULT 'preparing',
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shipments_order ON public.shipments(sales_order_id);
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View shipments" ON public.shipments
  FOR SELECT TO authenticated
  USING (
    EXISTS(SELECT 1 FROM sales_orders o WHERE o.id = sales_order_id AND o.user_id = auth.uid())
    OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'warehouse'::app_role) OR has_role(auth.uid(),'sales'::app_role)
  );
CREATE POLICY "Warehouse manage shipments" ON public.shipments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'warehouse'::app_role))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'warehouse'::app_role));

-- 8. coupons
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'fixed', -- fixed | percent
  value numeric NOT NULL DEFAULT 0,
  min_amount numeric NOT NULL DEFAULT 0,
  usage_limit integer NOT NULL DEFAULT 0, -- 0 = unlimited
  used_count integer NOT NULL DEFAULT 0,
  expired_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view active coupons" ON public.coupons
  FOR SELECT TO anon, authenticated
  USING (status = 'active');
CREATE POLICY "Admin manage coupons" ON public.coupons
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'sales'::app_role) OR has_role(auth.uid(),'finance'::app_role))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'sales'::app_role) OR has_role(auth.uid(),'finance'::app_role));

-- 9. wishlist
CREATE TABLE public.wishlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);
CREATE INDEX idx_wishlist_user ON public.wishlist(user_id);
ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own wishlist" ON public.wishlist
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(),'super_admin'::app_role));

-- 10. generate_so_no
CREATE OR REPLACE FUNCTION public.generate_so_no()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d text := to_char(now(), 'YYYYMMDD');
  n integer;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_no FROM 13) AS integer)),0)+1
  INTO n
  FROM public.sales_orders
  WHERE order_no LIKE 'SO-'||d||'-%';
  RETURN 'SO-'||d||'-'||LPAD(n::text, 4, '0');
END;
$$;

-- 11. updated_at triggers
CREATE TRIGGER trg_customer_addresses_updated BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_carts_updated BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_sales_orders_updated BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_shipments_updated BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_coupons_updated BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 12. seed coupons
INSERT INTO public.coupons (code, name, type, value, min_amount, usage_limit, expired_at, status) VALUES
  ('WELCOME100', '新會員首購折抵 100 元', 'fixed', 100, 500, 0, now() + interval '90 days', 'active'),
  ('SAVE10', '全站九折優惠', 'percent', 10, 1000, 500, now() + interval '30 days', 'active'),
  ('FREESHIP', '滿 2000 免運', 'fixed', 150, 2000, 0, now() + interval '60 days', 'active');
