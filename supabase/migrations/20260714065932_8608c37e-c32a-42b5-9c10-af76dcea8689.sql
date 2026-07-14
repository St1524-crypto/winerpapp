
CREATE TABLE public.purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_no text NOT NULL UNIQUE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  vendor_id uuid,
  vendor_name text NOT NULL,
  company_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','completed','cancelled')),
  reason text,
  notes text,
  subtotal numeric NOT NULL DEFAULT 0,
  inventory_status text NOT NULL DEFAULT 'not_processed' CHECK (inventory_status IN ('not_processed','processed','skipped')),
  payable_status text NOT NULL DEFAULT 'not_processed' CHECK (payable_status IN ('not_processed','processed','skipped')),
  payable_adjustment_id uuid,
  created_by uuid,
  completed_by uuid,
  completed_at timestamptz,
  cancelled_by uuid,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_returns_po ON public.purchase_returns(purchase_order_id);
CREATE INDEX idx_purchase_returns_company ON public.purchase_returns(company_id);
CREATE INDEX idx_purchase_returns_status ON public.purchase_returns(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_returns TO authenticated;
GRANT ALL ON public.purchase_returns TO service_role;

ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_returns admin manage"
ON public.purchase_returns
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin')
  OR private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'finance')
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin')
  OR private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'finance')
);

CREATE TRIGGER trg_purchase_returns_updated
BEFORE UPDATE ON public.purchase_returns
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


CREATE TABLE public.purchase_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_return_id uuid NOT NULL REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
  purchase_order_item_id uuid REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  product_id uuid,
  product_name text NOT NULL,
  sku text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  inventory_action text NOT NULL DEFAULT 'deduct_stock' CHECK (inventory_action IN ('deduct_stock','no_stock_change')),
  reason text,
  condition_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_return_items_return ON public.purchase_return_items(purchase_return_id);
CREATE INDEX idx_purchase_return_items_product ON public.purchase_return_items(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_return_items TO authenticated;
GRANT ALL ON public.purchase_return_items TO service_role;

ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_return_items admin manage"
ON public.purchase_return_items
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin')
  OR private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'finance')
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin')
  OR private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'finance')
);
