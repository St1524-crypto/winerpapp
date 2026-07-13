-- Step 1: sales return schema.
-- Adds return headers/items plus database guards. No stock, payment, wallet, or bonus
-- mutation is performed in this migration.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'sales_return_status'
  ) THEN
    CREATE TYPE public.sales_return_status AS ENUM (
      'draft',
      'submitted',
      'approved',
      'completed',
      'cancelled'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'sales_return_type'
  ) THEN
    CREATE TYPE public.sales_return_type AS ENUM (
      'partial_return',
      'full_return',
      'exchange',
      'refund_only'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'sales_return_inventory_action'
  ) THEN
    CREATE TYPE public.sales_return_inventory_action AS ENUM (
      'restock',
      'scrap',
      'no_stock_change'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_no text NOT NULL UNIQUE,
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  status public.sales_return_status NOT NULL DEFAULT 'draft',
  return_type public.sales_return_type NOT NULL DEFAULT 'partial_return',
  reason text,
  notes text,
  subtotal numeric NOT NULL DEFAULT 0,
  refund_amount numeric NOT NULL DEFAULT 0,
  points_reverse_status text NOT NULL DEFAULT 'not_processed',
  points_reverse_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  inventory_status text NOT NULL DEFAULT 'not_processed',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  approved_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_returns_amounts_nonnegative
    CHECK (subtotal >= 0 AND refund_amount >= 0),
  CONSTRAINT sales_returns_points_reverse_status_check
    CHECK (points_reverse_status IN ('not_processed', 'processed', 'failed', 'skipped')),
  CONSTRAINT sales_returns_inventory_status_check
    CHECK (inventory_status IN ('not_processed', 'processed', 'failed', 'skipped'))
);

CREATE TABLE IF NOT EXISTS public.sales_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_return_id uuid NOT NULL REFERENCES public.sales_returns(id) ON DELETE CASCADE,
  sales_order_item_id uuid NOT NULL REFERENCES public.sales_order_items(id) ON DELETE RESTRICT,
  product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  sku text,
  quantity integer NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  inventory_action public.sales_return_inventory_action NOT NULL DEFAULT 'restock',
  reason text,
  condition_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_return_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT sales_return_items_amounts_nonnegative CHECK (unit_price >= 0 AND subtotal >= 0),
  CONSTRAINT sales_return_items_one_line_per_order_item UNIQUE (sales_return_id, sales_order_item_id)
);

CREATE INDEX IF NOT EXISTS idx_sales_returns_sales_order
  ON public.sales_returns(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_company
  ON public.sales_returns(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_status
  ON public.sales_returns(status);
CREATE INDEX IF NOT EXISTS idx_sales_returns_created_at
  ON public.sales_returns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_return
  ON public.sales_return_items(sales_return_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_order_item
  ON public.sales_return_items(sales_order_item_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_product
  ON public.sales_return_items(product_id);

CREATE OR REPLACE FUNCTION public.set_sales_return_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_returns_set_updated_at ON public.sales_returns;
CREATE TRIGGER trg_sales_returns_set_updated_at
  BEFORE UPDATE ON public.sales_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.set_sales_return_updated_at();

DROP TRIGGER IF EXISTS trg_sales_return_items_set_updated_at ON public.sales_return_items;
CREATE TRIGGER trg_sales_return_items_set_updated_at
  BEFORE UPDATE ON public.sales_return_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_sales_return_updated_at();

CREATE OR REPLACE FUNCTION public.assert_sales_return_item_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_order_item_order_id uuid;
  v_ordered_qty integer;
  v_order_item_product_id uuid;
  v_product_name text;
  v_sku text;
  v_unit_price numeric;
  v_return_status public.sales_return_status;
  v_already_returned integer;
BEGIN
  SELECT sr.sales_order_id, sr.status
    INTO v_order_id, v_return_status
  FROM public.sales_returns sr
  WHERE sr.id = NEW.sales_return_id;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION '找不到退貨單主檔';
  END IF;

  IF v_return_status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION '退貨單狀態已確認，不能修改退貨明細';
  END IF;

  SELECT soi.sales_order_id,
         soi.quantity,
         soi.product_id,
         soi.product_name,
         soi.sku,
         soi.unit_price
    INTO v_order_item_order_id,
         v_ordered_qty,
         v_order_item_product_id,
         v_product_name,
         v_sku,
         v_unit_price
  FROM public.sales_order_items soi
  WHERE soi.id = NEW.sales_order_item_id;

  IF v_order_item_order_id IS NULL THEN
    RAISE EXCEPTION '找不到原訂單明細';
  END IF;

  IF v_order_item_order_id <> v_order_id THEN
    RAISE EXCEPTION '退貨明細不屬於同一張原訂單';
  END IF;

  SELECT COALESCE(SUM(sri.quantity), 0)
    INTO v_already_returned
  FROM public.sales_return_items sri
  JOIN public.sales_returns sr ON sr.id = sri.sales_return_id
  WHERE sri.sales_order_item_id = NEW.sales_order_item_id
    AND sri.id IS DISTINCT FROM NEW.id
    AND sr.status <> 'cancelled';

  IF v_already_returned + NEW.quantity > v_ordered_qty THEN
    RAISE EXCEPTION '退貨數量超過原訂單可退數量';
  END IF;

  NEW.product_id = COALESCE(NEW.product_id, v_order_item_product_id);
  NEW.product_name = COALESCE(NULLIF(BTRIM(NEW.product_name), ''), v_product_name);
  NEW.sku = COALESCE(NULLIF(BTRIM(NEW.sku), ''), v_sku);
  NEW.unit_price = COALESCE(NULLIF(NEW.unit_price, 0), v_unit_price, 0);
  NEW.subtotal = ROUND(NEW.quantity * NEW.unit_price, 2);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_return_items_assert_quantity ON public.sales_return_items;
CREATE TRIGGER trg_sales_return_items_assert_quantity
  BEFORE INSERT OR UPDATE ON public.sales_return_items
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_sales_return_item_quantity();

ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin and finance manage sales returns" ON public.sales_returns;
CREATE POLICY "Admin and finance manage sales returns"
  ON public.sales_returns
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'finance'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'finance'::public.app_role)
  );

DROP POLICY IF EXISTS "Admin and finance manage sales return items" ON public.sales_return_items;
CREATE POLICY "Admin and finance manage sales return items"
  ON public.sales_return_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sales_returns sr
      WHERE sr.id = sales_return_items.sales_return_id
        AND (
          public.has_role(auth.uid(), 'super_admin'::public.app_role)
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'finance'::public.app_role)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sales_returns sr
      WHERE sr.id = sales_return_items.sales_return_id
        AND (
          public.has_role(auth.uid(), 'super_admin'::public.app_role)
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'finance'::public.app_role)
        )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_returns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_return_items TO authenticated;
GRANT ALL ON public.sales_returns TO service_role;
GRANT ALL ON public.sales_return_items TO service_role;

COMMENT ON TABLE public.sales_returns IS 'Sales return headers. Step 1 schema only; later steps handle inventory and point reversal.';
COMMENT ON TABLE public.sales_return_items IS 'Sales return line items linked to original sales_order_items with quantity guard.';
COMMENT ON FUNCTION public.assert_sales_return_item_quantity() IS 'Prevents cumulative non-cancelled return quantity from exceeding the original order item quantity.';
