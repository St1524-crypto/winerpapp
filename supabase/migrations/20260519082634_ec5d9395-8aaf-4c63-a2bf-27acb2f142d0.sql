
-- 1. business_accounts
CREATE TABLE public.business_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  tax_id text UNIQUE,
  contact_name text,
  phone text,
  email text,
  address text,
  credit_limit numeric NOT NULL DEFAULT 0,
  credit_used numeric NOT NULL DEFAULT 0,
  payment_terms integer NOT NULL DEFAULT 30,
  account_level text NOT NULL DEFAULT 'retail',
  status text NOT NULL DEFAULT 'pending',
  sales_rep_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.business_accounts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_ba_updated BEFORE UPDATE ON public.business_accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. business_account_users
CREATE TABLE public.business_account_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_account_id uuid NOT NULL REFERENCES public.business_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_account_id, user_id)
);
ALTER TABLE public.business_account_users ENABLE ROW LEVEL SECURITY;

-- 3. price_tiers
CREATE TABLE public.price_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  account_level text NOT NULL,
  min_quantity integer NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.price_tiers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_price_tiers_product ON public.price_tiers(product_id, account_level, min_quantity);

-- 4. moq_rules
CREATE TABLE public.moq_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL UNIQUE,
  moq integer NOT NULL DEFAULT 1,
  carton_quantity integer NOT NULL DEFAULT 1,
  volume_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.moq_rules ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_moq_updated BEFORE UPDATE ON public.moq_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. b2b_orders
CREATE TABLE public.b2b_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text NOT NULL UNIQUE,
  business_account_id uuid NOT NULL REFERENCES public.business_accounts(id),
  sales_rep_id uuid,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_terms integer NOT NULL DEFAULT 30,
  payment_status text NOT NULL DEFAULT 'unpaid',
  order_status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.b2b_orders ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_b2bo_updated BEFORE UPDATE ON public.b2b_orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. b2b_order_items
CREATE TABLE public.b2b_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  b2b_order_id uuid NOT NULL REFERENCES public.b2b_orders(id) ON DELETE CASCADE,
  product_id uuid,
  sku text,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.b2b_order_items ENABLE ROW LEVEL SECURITY;

-- 7. account_statements
CREATE TABLE public.account_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_account_id uuid NOT NULL REFERENCES public.business_accounts(id) ON DELETE CASCADE,
  statement_month text NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  unpaid_amount numeric NOT NULL DEFAULT 0,
  due_date date,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_account_id, statement_month)
);
ALTER TABLE public.account_statements ENABLE ROW LEVEL SECURITY;

-- 8. sales_representatives
CREATE TABLE public.sales_representatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  department text,
  commission_rate numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_representatives ENABLE ROW LEVEL SECURITY;

-- Helper: is current user bound to a business account
CREATE OR REPLACE FUNCTION public.is_account_member(_account_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS(SELECT 1 FROM public.business_account_users WHERE business_account_id = _account_id AND user_id = _user_id)
$$;

-- RLS Policies
-- business_accounts
CREATE POLICY "Admin sales view ba" ON public.business_accounts FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales')
  OR public.has_role(auth.uid(),'finance')
  OR public.is_account_member(id, auth.uid())
);
CREATE POLICY "Admin sales manage ba" ON public.business_accounts FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales'))
WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales'));

-- business_account_users
CREATE POLICY "Admin sales manage bau" ON public.business_account_users FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales'))
WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales'));
CREATE POLICY "Users view own bau" ON public.business_account_users FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'finance'));

-- price_tiers
CREATE POLICY "Auth view price_tiers" ON public.price_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage price_tiers" ON public.price_tiers FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales'))
WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales'));

-- moq_rules
CREATE POLICY "Auth view moq" ON public.moq_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage moq" ON public.moq_rules FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'sales'))
WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'sales'));

-- b2b_orders
CREATE POLICY "Staff view b2b_orders" ON public.b2b_orders FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales')
  OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'warehouse')
  OR public.is_account_member(business_account_id, auth.uid())
);
CREATE POLICY "Sales manage b2b_orders" ON public.b2b_orders FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales'))
WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales'));

-- b2b_order_items
CREATE POLICY "Staff view b2b_oi" ON public.b2b_order_items FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales')
  OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'warehouse')
  OR EXISTS(SELECT 1 FROM public.b2b_orders o WHERE o.id = b2b_order_id AND public.is_account_member(o.business_account_id, auth.uid()))
);
CREATE POLICY "Sales manage b2b_oi" ON public.b2b_order_items FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales'))
WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales'));

-- account_statements
CREATE POLICY "View statements" ON public.account_statements FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales')
  OR public.has_role(auth.uid(),'finance')
  OR public.is_account_member(business_account_id, auth.uid())
);
CREATE POLICY "Finance manage statements" ON public.account_statements FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'finance'))
WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'finance'));

-- sales_representatives
CREATE POLICY "Auth view sales_reps" ON public.sales_representatives FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage sales_reps" ON public.sales_representatives FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'super_admin'))
WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Seed data
INSERT INTO public.business_accounts (id, company_name, tax_id, contact_name, phone, email, credit_limit, credit_used, payment_terms, account_level, status, notes) VALUES
  ('a0000000-0000-0000-0000-000000000001','源富科技股份有限公司','12345678','王大明','02-2345-6789','contact@yuanfu.tw',500000,120000,30,'wholesale','approved','長期合作批發商'),
  ('a0000000-0000-0000-0000-000000000002','晶華貿易有限公司','87654321','李美麗','02-8765-4321','sales@jinghua.tw',1000000,350000,60,'agent','approved','VIP 代理商'),
  ('a0000000-0000-0000-0000-000000000003','新光商行','11223344','陳小華','03-1234-5678','info@xinguang.tw',200000,0,30,'vip','pending','新申請待審核');

INSERT INTO public.account_statements (business_account_id, statement_month, total_amount, paid_amount, unpaid_amount, due_date, status) VALUES
  ('a0000000-0000-0000-0000-000000000001','2026-04', 280000, 280000, 0, '2026-05-31','paid'),
  ('a0000000-0000-0000-0000-000000000001','2026-05', 120000, 0, 120000, '2026-06-30','pending'),
  ('a0000000-0000-0000-0000-000000000002','2026-05', 350000, 100000, 250000, '2026-07-31','partial');
