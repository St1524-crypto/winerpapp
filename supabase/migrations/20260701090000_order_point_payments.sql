-- Order point payment ledger for discount / shopping / reward point offsets.
-- This migration only adds ledger storage and access rules. It does not change
-- existing order, checkout, wallet, or payment execution flows.

CREATE TABLE IF NOT EXISTS public.order_point_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  point_type text NOT NULL CHECK (point_type IN ('discount', 'shopping', 'reward')),
  points_used integer NOT NULL CHECK (points_used > 0),
  amount_offset numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_offset >= 0),
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'refunded', 'failed')),
  point_transaction_id uuid REFERENCES public.point_transactions(id) ON DELETE SET NULL,
  dedupe_key text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  refunded_at timestamptz,
  note text
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_point_payments_dedupe_key
  ON public.order_point_payments (dedupe_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_point_payments_order_point_type
  ON public.order_point_payments (sales_order_id, point_type);

CREATE INDEX IF NOT EXISTS idx_order_point_payments_order
  ON public.order_point_payments (sales_order_id);

CREATE INDEX IF NOT EXISTS idx_order_point_payments_member
  ON public.order_point_payments (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_point_payments_status
  ON public.order_point_payments (status, created_at DESC);

GRANT SELECT ON public.order_point_payments TO authenticated;
GRANT INSERT, UPDATE ON public.order_point_payments TO authenticated;
GRANT ALL ON public.order_point_payments TO service_role;

ALTER TABLE public.order_point_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_point_payments_member_read" ON public.order_point_payments;
CREATE POLICY "order_point_payments_member_read"
  ON public.order_point_payments
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = member_id
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
  );

DROP POLICY IF EXISTS "order_point_payments_admin_manage" ON public.order_point_payments;
CREATE POLICY "order_point_payments_admin_manage"
  ON public.order_point_payments
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
