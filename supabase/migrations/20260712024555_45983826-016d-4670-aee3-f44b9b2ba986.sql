
CREATE TABLE IF NOT EXISTS public.order_point_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  point_type text NOT NULL CHECK (point_type IN ('discount','shopping','reward')),
  points_used integer NOT NULL CHECK (points_used > 0),
  amount_offset numeric NOT NULL DEFAULT 0 CHECK (amount_offset >= 0),
  status text NOT NULL DEFAULT 'applied',
  point_transaction_id uuid REFERENCES public.point_transactions(id) ON DELETE SET NULL,
  dedupe_key text NOT NULL UNIQUE,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_point_payments_order ON public.order_point_payments(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_order_point_payments_member ON public.order_point_payments(member_id);

GRANT SELECT ON public.order_point_payments TO authenticated;
GRANT ALL ON public.order_point_payments TO service_role;

ALTER TABLE public.order_point_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own point payments"
  ON public.order_point_payments FOR SELECT
  TO authenticated
  USING (
    auth.uid() = member_id
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
  );
