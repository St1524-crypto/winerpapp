
-- 1. Add cash balance to wallet
ALTER TABLE public.member_points_wallet
  ADD COLUMN IF NOT EXISTS cash_balance numeric(14,2) NOT NULL DEFAULT 0;

-- 2. Cash transactions ledger
CREATE TABLE IF NOT EXISTS public.cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tx_type text NOT NULL CHECK (tx_type IN ('topup','withdraw','buy_points','refund','adjust')),
  amount numeric(14,2) NOT NULL,
  balance_after numeric(14,2),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
  payment_method text,
  bank_info text,
  note text,
  reference_id uuid,
  related_point_amount integer,
  created_by uuid,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_tx_user ON public.cash_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_tx_status ON public.cash_transactions (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.cash_transactions TO authenticated;
GRANT ALL ON public.cash_transactions TO service_role;

ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own cash tx"
  ON public.cash_transactions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'finance'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role)
    OR private.has_role(auth.uid(),'admin'::app_role)
  );

CREATE POLICY "Users insert own cash request"
  ON public.cash_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'finance'::app_role)
    OR private.has_role(auth.uid(),'admin'::app_role)
  );

CREATE POLICY "Admin manage cash tx"
  ON public.cash_transactions FOR UPDATE
  TO authenticated
  USING (
    private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'finance'::app_role)
    OR private.has_role(auth.uid(),'admin'::app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'finance'::app_role)
    OR private.has_role(auth.uid(),'admin'::app_role)
  );
