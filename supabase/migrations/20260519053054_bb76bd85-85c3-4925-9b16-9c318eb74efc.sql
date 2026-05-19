
-- 1. 擴充 vendors（供應商）
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS shipping_method text;

-- 2. 擴充 purchase_orders
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS notes text;

-- 3. purchase_order_items
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  sku text,
  unit text DEFAULT '件',
  quantity integer NOT NULL DEFAULT 0,
  received_quantity integer NOT NULL DEFAULT 0,
  price numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON public.purchase_order_items(purchase_order_id);
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Warehouse manage po items" ON public.purchase_order_items
FOR ALL TO authenticated
USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'warehouse'))
WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'warehouse'));

CREATE POLICY "Staff view po items" ON public.purchase_order_items
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'finance') OR has_role(auth.uid(),'sales'));

-- 4. warehouses
CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_code text NOT NULL UNIQUE,
  name text NOT NULL,
  address text,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Warehouse manage warehouses" ON public.warehouses
FOR ALL TO authenticated
USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'warehouse'))
WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'warehouse'));

CREATE POLICY "Authenticated view warehouses" ON public.warehouses
FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_warehouses_updated
BEFORE UPDATE ON public.warehouses
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 預設主倉庫
INSERT INTO public.warehouses (warehouse_code, name, address)
VALUES ('WH-MAIN','主倉庫','台北市')
ON CONFLICT (warehouse_code) DO NOTHING;

-- 5. warehouse_inventory
CREATE TABLE IF NOT EXISTS public.warehouse_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  stock integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(warehouse_id, product_id)
);
ALTER TABLE public.warehouse_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Warehouse manage wh inventory" ON public.warehouse_inventory
FOR ALL TO authenticated
USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'warehouse'))
WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'warehouse'));

CREATE POLICY "Authenticated view wh inventory" ON public.warehouse_inventory
FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_wh_inv_updated
BEFORE UPDATE ON public.warehouse_inventory
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. inventory_transactions
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  type text NOT NULL, -- purchase_in, manual_in, manual_out, order_out, adjust, return_in
  quantity integer NOT NULL DEFAULT 0,
  before_stock integer NOT NULL DEFAULT 0,
  after_stock integer NOT NULL DEFAULT 0,
  reference_no text,
  reason text,
  operator_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_tx_product ON public.inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_warehouse ON public.inventory_transactions(warehouse_id);
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Warehouse manage inv tx" ON public.inventory_transactions
FOR ALL TO authenticated
USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'warehouse'))
WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'warehouse'));

CREATE POLICY "Authenticated view inv tx" ON public.inventory_transactions
FOR SELECT TO authenticated USING (true);

-- 7. goods_receiving
CREATE TABLE IF NOT EXISTS public.goods_receiving (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no text NOT NULL UNIQUE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  received_by uuid,
  received_date timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'completed',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gr_po ON public.goods_receiving(purchase_order_id);
ALTER TABLE public.goods_receiving ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Warehouse manage gr" ON public.goods_receiving
FOR ALL TO authenticated
USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'warehouse'))
WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'warehouse'));

CREATE POLICY "Staff view gr" ON public.goods_receiving
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'finance'));

-- 8. 採購單號自動生成
CREATE OR REPLACE FUNCTION public.generate_po_no()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d text := to_char(now(), 'YYYYMMDD');
  n integer;
  result text;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(po_no FROM 13) AS integer)),0)+1
  INTO n
  FROM public.purchase_orders
  WHERE po_no LIKE 'PO-'||d||'-%';
  result := 'PO-'||d||'-'||LPAD(n::text, 4, '0');
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_po_no() TO authenticated;

-- 9. 收貨單號自動生成
CREATE OR REPLACE FUNCTION public.generate_receipt_no()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d text := to_char(now(), 'YYYYMMDD');
  n integer;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_no FROM 13) AS integer)),0)+1
  INTO n
  FROM public.goods_receiving
  WHERE receipt_no LIKE 'GR-'||d||'-%';
  RETURN 'GR-'||d||'-'||LPAD(n::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_receipt_no() TO authenticated;
